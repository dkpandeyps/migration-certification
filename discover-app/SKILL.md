---
name: discover-app
description: Dynamically crawls a web application to produce a complete inventory of all pages, forms, fields, tables, dialogs, workflows, and API endpoints. Foundation skill for all certification runs.
version: 1.0.0
preamble-tier: 1
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---

# /discover-app — Application Discovery Engine

> **Path resolution:** relative paths in this skill (`shared/...`, `<skill-name>/references/...`, `<skill-name>/templates/...`)
> are relative to the skills root — the folder that contains this skill's folder (normally `~/.claude/skills/`).
> Read them from there, whatever the current working directory is. `install.ps1` / `install.sh` put `shared/` there.


Crawls any web application using Playwright-backed browser automation to produce `inventory.json` and `coverage-map.json`. Uses BFS with SPA-aware route extraction. Discovers all menus, submenus, forms, fields, tables, dialogs, workflows, and API endpoints dynamically — no hardcoded modules.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `url` | Yes | — | Root URL of the application |
| `username` | Yes | — | Login username |
| `password` | Yes | — | Login password |
| `login_mode` | No | `form` | `form` \| `cookie` \| `script` |
| `session_cookie` | No | — | Pre-authenticated cookie (when `login_mode=cookie`) |
| `login_script_path` | No | — | Path to custom login instructions markdown (when `login_mode=script`) |
| `roles` | No | — | Inline alternative to `roles_file`: `roles=merchant,support merchant_username=.. merchant_password=.. support_username=.. support_password=..` (add `{role}_old_username` / `{role}_old_password` for a different legacy login). Treated exactly like `roles_file` |
| `roles_file` | No | — | JSON file with credentials for additional roles (format in `shared/browse-integration.md → Role Credentials File`). Every role in it gets its own discovery pass |
| `role_side` | No | `new` | `legacy` makes every role use its `old_username`/`old_password` from the roles file (falls back to `username`/`password`). Set by `/migration-certification` |
| `scope` | No | — | Comma-separated URL path prefixes to stay inside (e.g. `/admin/globalMidRule,/admin/midRule`). Pages outside scope are recorded from the nav but not crawled. Omit to crawl the whole app |
| `session_path` | No | — | Write into this existing session directory instead of creating a new one (used by the orchestrator skills) |
| `resume` | No | `false` | `true` to resume from an existing checkpoint |

## Example Usage

```
/discover-app url=https://app.example.com username=admin password=secret123
/discover-app url=https://app.example.com username=admin password=secret123 roles_file=./roles.json
/discover-app url=https://app.example.com/admin/banks username=admin password=secret123 scope=/admin/banks
/discover-app url=https://app.example.com login_mode=cookie session_cookie="sessionId=abc123"
```

---

## Preamble

```bash
# ── Session Setup ──────────────────────────────────────────────────────────────
SESSION_ID="$(date +%Y%m%d_%H%M%S)_$(echo "$url" | sed 's|https\?://||' | sed 's|[^a-zA-Z0-9]|_|g' | cut -c1-30)"
SESSION_DIR="${session_path:-$(pwd)/certification-runs/$SESSION_ID}"

mkdir -p "$SESSION_DIR/discovery/screenshots"
mkdir -p "$SESSION_DIR/coverage"
mkdir -p "$SESSION_DIR/evidence/api-logs"
mkdir -p "$SESSION_DIR/evidence/console-logs"

echo "Session: $SESSION_DIR"

# ── Browse Binary (paysec) ─────────────────────────────────────────────────────
BROWSE="${PAYSEC_BROWSE_BIN:-}"
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
for _cand in ${_ROOT:+"$_ROOT/.claude/skills/paysec/browser/dist/browse"} "$HOME/.claude/skills/paysec/browser/dist/browse"; do
  [ -n "$BROWSE" ] && break
  if [ -x "$_cand" ]; then BROWSE="$_cand"; elif [ -x "$_cand.exe" ]; then BROWSE="$_cand.exe"; fi
done

if [ -z "$BROWSE" ]; then
  echo "BLOCKED: paysec browse binary not found."
  echo "Run: cd ~/.claude/skills/paysec && ./setup"
  exit 1
fi

# ── Checkpoint Check ───────────────────────────────────────────────────────────
CHECKPOINT="$SESSION_DIR/checkpoint.json"
if [ -f "$CHECKPOINT" ] && [ "${resume:-false}" != "true" ]; then
  echo "Existing checkpoint found at $CHECKPOINT"
  # Present resume option to user via AskUserQuestion
fi

echo "Starting discovery for: $url"
echo "Login mode: ${login_mode:-form}"
```

---

## Phase 0 — Login

Read `shared/browse-integration.md` for the full login implementation. Apply the login mode specified.

### form mode (default)
1. `browse goto {url}`
2. `browse snapshot -i -a`
3. Identify username and password fields by label, placeholder, or `type` attribute
4. Fill username field, fill password field
5. Click the submit/login button
6. `browse wait --networkidle`
7. Verify you are NOT still on the login page (check URL and page title)
8. If login failed: output BLOCKED with the error message

### cookie mode
1. `browse goto {url}`
2. `browse js "document.cookie = '{session_cookie}'"`
3. `browse goto {url}` (reload with cookie)
4. Verify you are authenticated

### script mode
1. Read the file at `{login_script_path}`
2. Follow the instructions in that file exactly to complete login
3. Verify you are authenticated after completing the script

**After any login mode:** Set up network interception using the script in `shared/browse-integration.md → Network Interception Setup`.

---

## Phase 1 — SPA Detection

Before beginning BFS, detect the application type:

1. Take a snapshot of the current page
2. Check for SPA indicators (single div root, JS framework globals)
3. Execute the SPA route extraction JS from `shared/discovery-engine.md → SPA Detection`
4. Set `SPA_MODE=true/false` in session state
5. Write to `discovery/session-meta.json`: `{"spa_mode": true/false, "detected_framework": "react|vue|angular|unknown|none"}`

---

## Phase 2 — Discovery BFS

Follow the full BFS algorithm defined in `shared/discovery-engine.md`. Key points:

- Read `shared/discovery-engine.md` fully before starting
- Use URL normalization (strip numeric IDs, normalize patterns)
- Activate tab panels and trigger dialogs per the protocol
- Capture network traffic as you go
- Write checkpoint every 5 pages
- If `scope` is set, apply the scope filter from `shared/discovery-engine.md → Scope Filter` before queueing any URL
- For each role in `roles_file`, run a separate discovery pass and merge results (tag each item with `visible_to_roles`)

**During BFS, maintain running counts and print progress:**
```
[DISCOVERY] Pages: 5 | Forms: 3 | Fields: 18 | Tables: 2 | Workflows: 0 | APIs: 7
```
Print this after every page visited.

---

## Phase 3 — Workflow Detection

After BFS completes, analyze the collected inventory for workflows.

Apply the three workflow detection signals from `shared/discovery-engine.md`:

1. **Multi-step wizards:** Scan all discovered forms for "Next", "Previous", "Step N of M" patterns → group into a workflow
2. **Status-transition buttons:** Find buttons adjacent to status display fields → these trigger workflow transitions
3. **Confirmation dialogs:** Buttons that open confirm-before-execute dialogs → these are workflow steps

For each detected workflow, write a descriptor into `inventory.json → workflows[]`.

---

## Phase 4 — Output Generation

### Write inventory.json
Compile the full inventory using the schema from `shared/output-schemas.md → inventory.json`.

Write to: `{SESSION_DIR}/discovery/inventory.json`

### Write coverage-map.json
Initialize the coverage map with all discovered items set to `status: "not_covered"`.

Follow the schema from `shared/output-schemas.md → coverage-map.json`.

Write to: `{SESSION_DIR}/discovery/coverage-map.json`

### Write session-summary.md
A human-readable summary:
```markdown
# Discovery Summary — {url}

- Session: {SESSION_ID}
- Completed: {timestamp}
- Pages discovered: {N}
- Forms discovered: {N} (Fields: {N})
- Tables discovered: {N}
- Dialogs discovered: {N}
- Workflows discovered: {N}
- API endpoints captured: {N}
- SPA Mode: {yes/no}
- Duration: {N} seconds

## Pages Discovered
| # | URL | Title | Forms | Tables |
|---|-----|-------|-------|--------|
...

## Workflows Detected
...

## API Endpoints Captured
...
```

---

## Phase 5 — Multi-Role Discovery (if roles_file provided)

For each role in `roles_file`:
1. Open a new browse session (or clear cookies and re-login)
2. Login as that role with its credentials from `roles_file`. If login fails, record the role under `session-meta.json → failed_role_logins` and continue — never silently drop a role
3. Run Phase 1–3 with role name in context
4. Tag each discovered item with `visible_to_roles: ["{role}"]`
5. Merge into main inventory (add new items, update role visibility on existing items)

---

## Completion Status

Output one of:
- **DONE** — inventory.json and coverage-map.json written, all pages discovered
- **DONE_WITH_CONCERNS** — inventory written but some pages were unreachable (list them), or session expired and was refreshed during run
- **BLOCKED** — browse binary not found, login failed, or target URL unreachable
- **NEEDS_CONTEXT** — login_mode=script but no login_script_path provided, or `roles_file` path does not exist

Always end with:
```
Discovery complete.
Session: {SESSION_DIR}
Pages: {N} | Forms: {N} | Fields: {N} | Workflows: {N} | APIs: {N}
Output: {SESSION_DIR}/discovery/inventory.json
```

---

## Telemetry

```bash
~/.claude/skills/paysec/bin/paysec-timeline-log "{\"skill\":\"discover-app\",\"event\":\"completed\",\"session\":\"$SESSION_ID\",\"pages\":$PAGE_COUNT,\"forms\":$FORM_COUNT}" 2>/dev/null || true
```
