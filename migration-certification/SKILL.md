---
name: migration-certification
description: Certifies a migration by running discovery and certification on both the legacy and new application, then comparing inventories, behaviors, and test results to produce a gap report, traceability matrix, and migration score.
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

# /migration-certification — Migration Readiness Certification

> **Path resolution:** relative paths in this skill (`shared/...`, `<skill-name>/references/...`, `<skill-name>/templates/...`)
> are relative to the skills root — the folder that contains this skill's folder (normally `~/.claude/skills/`).
> Read them from there, whatever the current working directory is. `install.ps1` / `install.sh` put `shared/` there.


> **⛔ ENFORCEMENT RULE — READ BEFORE ANY ACTION**
>
> If you are about to use `browse goto`, `browse snapshot`, or `browse screenshot` commands to manually navigate and visually compare two applications **instead of running this skill**, STOP IMMEDIATELY.
>
> **Manual browsing produces only a visual/structural comparison. It does NOT:**
> - Add, Edit, or Delete records to verify CRUD works
> - Test form field validation (required fields, invalid inputs, error messages)
> - Verify data persists after save
> - Test role-based access by actually attempting restricted actions
> - Run behavioral diffs (response structure, error message wording, post-action state)
>
> **The result of manual browsing is a migration gap OBSERVATION, not a migration CERTIFICATION.**
>
> This skill MUST be invoked as `/migration-certification` with its full phase pipeline. If login is complex (captcha, SSO, wrong field selectors), resolve it first using `login_mode=cookie` or fix the selector — then run this skill. Do not substitute manual browsing as a workaround.
>
> **Password field selector known issue:** Some apps have two password-related inputs — a visible `type=password id=floatingPassword` AND a hidden `type=hidden name=password`. Always use `input[id=floatingPassword]` or `input[type=password]`, never `input[name=password]`.

Fully certifies the legacy system and the new system one after the other — every page in scope, every form and field, CRUD, UI/UX, workflows, and every role — then performs a 5-layer behavioral comparison (including per-role permission parity) to find missing features, functional regressions, access-control changes, and behavioral drift. Outputs a migration score, gap report, and traceability matrix.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `old_url` | Yes | — | Legacy application URL |
| `new_url` | Yes | — | New application URL |
| `username` | Yes | — | Login username (same for both systems) |
| `password` | Yes | — | Login password (same for both systems) |
| `role` | Yes | — | Primary role to certify |
| `old_username` | No | `username` | Override username for legacy system |
| `old_password` | No | `password` | Override password for legacy system |
| `login_mode` | No | `form` | Login mode for both systems |
| `dry_run` | No | `false` | Skip destructive tests |
| `roles` | No | — | Inline alternative to `roles_file`: `roles=merchant,support merchant_username=.. merchant_password=.. support_username=.. support_password=..` (add `{role}_old_username` / `{role}_old_password` for a different legacy login). Treated exactly like `roles_file` |
| `roles_file` | No (with `--full`, this or `roles` is required) | — | JSON file with credentials for every other role (see `shared/browse-integration.md → Role Credentials File`). Each role is certified on both systems and compared |
| `scope` | No | — | URL path prefixes to certify on both systems (e.g. one page/module). Omit to certify the whole app |
| `old_scope` / `new_scope` | No | `scope` | Per-system scope, for when the same page has different URLs on legacy and new |
| `shared_db` | No | `false` | `true` when both systems use the same database — adds cross-system data checks and record tagging |
| `--quick` | No | flag | Skip paysec review and PDF generation |
| `--final` | No | flag | Full review + Jira + PDFs |
| `--full` | No | flag | **Full migration certification**: everything in `--final`, plus every role, no dry run, and a strict completeness check. See "Full Mode" below |

## Example Usage

```
/migration-certification old_url=https://legacy.example.com new_url=https://new.example.com username=admin password=secret role=admin
/migration-certification old_url=https://legacy.example.com new_url=https://new.example.com username=admin password=secret role=admin --final
/migration-certification old_url=https://legacy.example.com/admin/globalMidRule new_url=https://new.example.com/global-mid-rule old_scope=/admin/globalMidRule new_scope=/global-mid-rule username=admin password=secret role=admin roles_file=./roles.json shared_db=true --full
```

---

## Full Mode (`--full`)

Use `--full` for the sign-off run of a page, module, or whole app. It means **both systems are tested completely,
by every role, with nothing skipped**:

| Rule | What `--full` enforces |
|---|---|
| Both systems, every page in scope | Discovery + certification on legacy, then on new (never in parallel — required when `shared_db=true`) |
| Every test category on both sides | Field tests, CRUD (Add/Edit/Delete/View/Search/Filter/Export + custom actions), 9 UI/UX checks, workflows (success + failure paths), API capture |
| Every role | Primary role + every role in `roles_file`, on both systems. Missing `roles_file` → stop with NEEDS_CONTEXT and ask for it (via AskUserQuestion), or for explicit confirmation that the app has only one role |
| No dry run | `dry_run=true` with `--full` → stop and ask. Destructive actions are part of a full certification; run against a test environment and use session-tagged test records |
| Completeness check is a hard stop | Phase 5b must pass on both sides before any comparison or score is produced |
| Readiness + reports | `/production-readiness-review` on both systems, `/plan-business-review`, `/generate-jira-bugs`, `/generate-pdf-report` |

`--full` never accepts hand-written or partial results as a substitute for the phases below.

---

## Preamble

```bash
SESSION_ID="$(date +%Y%m%d_%H%M%S)_migration_$(echo "$new_url" | sed 's|https\?://||' | sed 's|[^a-zA-Z0-9]|_|g' | cut -c1-20)"
SESSION_DIR="$(pwd)/certification-runs/$SESSION_ID"

mkdir -p "$SESSION_DIR/old/discovery"
mkdir -p "$SESSION_DIR/new/discovery"
mkdir -p "$SESSION_DIR/old/test-data"
mkdir -p "$SESSION_DIR/new/test-data"
mkdir -p "$SESSION_DIR/old/test-results"
mkdir -p "$SESSION_DIR/new/test-results"
mkdir -p "$SESSION_DIR/old/coverage"
mkdir -p "$SESSION_DIR/new/coverage"
mkdir -p "$SESSION_DIR/comparison"
mkdir -p "$SESSION_DIR/reports"
mkdir -p "$SESSION_DIR/defects"

echo "Migration Session: $SESSION_DIR"
echo "Legacy: $old_url  (scope: ${old_scope:-${scope:-whole app}})"
echo "New:    $new_url  (scope: ${new_scope:-${scope:-whole app}})"

OLD_SCOPE="${old_scope:-$scope}"
NEW_SCOPE="${new_scope:-$scope}"

# ── Full mode pre-flight ───────────────────────────────────────────────────────
if [ "${full:-false}" = "true" ]; then
  final=true
  if [ -z "$roles_file" ] && [ -z "$roles" ]; then
    echo "NEEDS_CONTEXT: --full needs roles_file or roles= with every other role (or confirm the app has a single role)"
  elif [ -n "$roles_file" ] && [ ! -f "$roles_file" ]; then
    echo "NEEDS_CONTEXT: roles_file not found: $roles_file"
  fi
  if [ "${dry_run:-false}" = "true" ]; then
    echo "NEEDS_CONTEXT: --full and dry_run=true conflict — a full certification performs destructive actions"
  fi
fi
```

If any NEEDS_CONTEXT line printed, ask the user with AskUserQuestion before continuing. Do not drop roles or switch
to dry run on your own.

---

## Phase 1 — Discovery on Legacy System

```
/discover-app url={old_url} username={old_username or username} password={old_password or password} login_mode={login_mode} roles_file={roles_file} roles={roles} role_side=legacy scope={OLD_SCOPE} session_path={SESSION_DIR}/old
```

Verify: `{SESSION_DIR}/old/discovery/inventory.json` produced.

Read counts: old_pages, old_forms, old_fields, old_workflows, old_apis.

---

## Phase 2 — Discovery on New System

```
/discover-app url={new_url} username={username} password={password} login_mode={login_mode} roles_file={roles_file} roles={roles} role_side=new scope={NEW_SCOPE} session_path={SESSION_DIR}/new
```

Verify: `{SESSION_DIR}/new/discovery/inventory.json` produced.

---

## Phase 3 — Inventory Diff

Spawn a sub-agent:
```
Agent(
  description: "Inventory comparison: legacy vs new",
  prompt: "
    Compare two application inventories and produce a diff report.
    
    Legacy inventory: {SESSION_DIR}/old/discovery/inventory.json
    New inventory: {SESSION_DIR}/new/discovery/inventory.json
    
    Follow migration-certification/references/comparison-protocol.md → Inventory Diff section.
    
    Write diff to: {SESSION_DIR}/comparison/inventory-diff.json
  "
)
```

---

## Phase 4 — Certification on Legacy System

```
/application-certification url={old_url} username={old_username} password={old_password} role={role} login_mode={login_mode} dry_run={dry_run} roles_file={roles_file} roles={roles} role_side=legacy scope={OLD_SCOPE} session_path={SESSION_DIR}/old --quick
```

Wait for completion. Read `{SESSION_DIR}/old/certification-result.json`.

---

## Phase 5 — Certification on New System

```
/application-certification url={new_url} username={username} password={password} role={role} login_mode={login_mode} dry_run={dry_run} roles_file={roles_file} roles={roles} role_side=new scope={NEW_SCOPE} session_path={SESSION_DIR}/new --quick
```

Wait for completion. Read `{SESSION_DIR}/new/certification-result.json`.

`--quick` here only skips the per-system review/Jira/PDF steps — those run once for the migration in Phases 10–11.
All testing phases still run on each system. `role_side=legacy` makes the legacy run use each role's
`old_username`/`old_password` where given.

When `shared_db=true`: run Phase 4 to completion before starting Phase 5, and tag every created record with
`CERT_{session_id}_` so Layer 4 can find it on both systems.

---

## Phase 5b — Completeness Check (both systems, hard stop)

Before comparing anything, prove that each system was fully tested. For `side` in `old`, `new`:

| Check | Pass condition |
|---|---|
| Discovery | `{side}/discovery/inventory.json` exists with ≥ 1 page |
| Test data | one `{side}/test-data/{form_slug}.json` per form in the inventory |
| Form tests | one `form-tests/*-results.json` per form |
| UI/UX tests | one `ui-ux-tests/*-uiux-results.json` per form |
| CRUD tests | one `crud-tests/*-results.json` per table/module |
| Workflow tests | one `workflow-tests/*-results.json` per workflow |
| Permission tests | one `permission-tests/{role}-matrix.json` for the primary role and **every** role in `roles_file` |
| Coverage | all 7 `{side}/coverage/*.json` files present |
| Evidence | every test case has an existing screenshot |
| Same roles both sides | the set of roles tested on legacy = the set tested on new |

Write `{SESSION_DIR}/comparison/completeness.json`:
```json
{
  "old": {"complete": true,  "missing": []},
  "new": {"complete": false, "missing": ["permission-tests/support-matrix.json", "ui-ux-tests for form_004"]},
  "roles": {"old": ["admin", "merchant", "support"], "new": ["admin", "merchant"]}
}
```

If either side is incomplete: re-run only the missing phase for that side (resume with `session_path`), then check
again. If it still cannot complete (login failure, unreachable page), record the reason. Then:
- `--full`: stop with status INCOMPLETE. Do not produce a migration score.
- other modes: continue, but set `recommendation = "INCOMPLETE"` and list every missing item at the top of the report.

---

## Phase 6 — Behavioral Comparison (5 Layers)

Spawn a sub-agent:
```
Agent(
  description: "5-layer behavioral diff: legacy vs new",
  prompt: "
    Compare certification results between legacy and new systems across 5 layers
    (pass/fail parity, validation messages, API shape, data state, per-role permission parity).
    Roles to compare: primary role + every role in roles_file.
    shared_db={shared_db}
    
    Legacy test results: {SESSION_DIR}/old/test-results/
    New test results: {SESSION_DIR}/new/test-results/
    Legacy inventory: {SESSION_DIR}/old/discovery/inventory.json
    New inventory: {SESSION_DIR}/new/discovery/inventory.json
    
    Follow migration-certification/references/comparison-protocol.md → Behavioral Diff section.
    
    Write behavioral diff to: {SESSION_DIR}/comparison/behavioral-diff.json
  "
)
```

---

## Phase 7 — Gap Report Generation

Spawn a sub-agent:
```
Agent(
  description: "Migration gap analysis",
  prompt: "
    Produce a structured gap report from inventory diff and behavioral diff.
    
    Inventory diff: {SESSION_DIR}/comparison/inventory-diff.json
    Behavioral diff: {SESSION_DIR}/comparison/behavioral-diff.json
    
    Follow migration-certification/references/gap-analysis.md.
    
    Write to: {SESSION_DIR}/migration-gap-report.json
  "
)
```

---

## Phase 8 — Traceability Matrix

Spawn a sub-agent:
```
Agent(
  description: "Traceability matrix construction",
  prompt: "
    Build a traceability matrix mapping every legacy page/form to its new equivalent.
    
    Legacy inventory: {SESSION_DIR}/old/discovery/inventory.json
    New inventory: {SESSION_DIR}/new/discovery/inventory.json
    Inventory diff: {SESSION_DIR}/comparison/inventory-diff.json
    Gap report: {SESSION_DIR}/migration-gap-report.json
    
    Follow migration-certification/references/traceability-matrix.md.
    
    Write to: {SESSION_DIR}/traceability-matrix.json
    Also write markdown table to: {SESSION_DIR}/traceability-matrix.md
  "
)
```

---

## Phase 9 — Migration Score

Calculate:
```
total_old_features = old_pages + old_forms + old_workflows
equivalent         = features in new that are equivalent (from gap report)
missing            = features in old that are missing in new

migration_score = (equivalent / total_old_features) * 100
```

Write `{SESSION_DIR}/migration-score.json`:
```json
{
  "migration_score": 94.2,
  "total_old_features": 52,
  "equivalent": 49,
  "missing": 1,
  "changed": 2,
  "new_features_in_new": 3,
  "score_interpretation": "Good — 1 missing feature, 2 behavioral changes need review",
  "recommendation": "PROCEED_WITH_CONDITIONS | HOLD | PROCEED"
}
```

Migration recommendation:
- `INCOMPLETE` if Phase 5b failed on either system (checked first — a partial run never gets PROCEED)
- `PROCEED` if score >= 100% (no missing, no critical gaps)
- `PROCEED_WITH_CONDITIONS` if score >= 90% and no critical gaps
- `HOLD` if score < 90% or any critical gaps exist (critical gaps include `permission_escalation` and `role_login_mismatch`)

Also record in `migration-score.json`: `"roles_compared": [...]`, `"scope": {"old": ..., "new": ...}`, and
`"completeness": "complete | incomplete"`.

---

## Phase 10 — Readiness + paysec Review (--final / --full)

1. `/production-readiness-review session_path={SESSION_DIR}/new` — gate check of the new system on its own (all 10 gates)
2. `/production-readiness-review session_path={SESSION_DIR}/old` — same for legacy, for reference only (shows which defects already existed)
3. Invoke paysec's `/plan-business-review` with the migration context (migration score, gap report, permission gaps, traceability matrix, both readiness results) for an executive go-live recommendation.

---

## Phase 11 — Jira + Reports (--final / --full)

```
/generate-jira-bugs session_path={SESSION_DIR}
/generate-pdf-report session_path={SESSION_DIR}
```

---

## Final Output

```
╔══════════════════════════════════════════════════════╗
║        MIGRATION CERTIFICATION RESULT                ║
╠══════════════════════════════════════════════════════╣
║  Legacy: https://legacy.example.com                  ║
║  New:    https://new.example.com                     ║
║  Migration Score: 94.2/100                           ║
║  Recommendation: PROCEED_WITH_CONDITIONS             ║
╠══════════════════════════════════════════════════════╣
║  Missing Features:       1  (Critical)               ║
║  Functional Regressions: 0                           ║
║  Behavioral Drifts:      2  (High)                   ║
║  New Features in New:    3  (Informational)          ║
║  Permission Gaps:        1  (merchant → Delete)      ║
║  Roles Compared:         admin, merchant, support    ║
║  Completeness:           ✅ both systems complete    ║
╠══════════════════════════════════════════════════════╣
║  Session: certification-runs/20260611_142200_...     ║
╚══════════════════════════════════════════════════════╝
```

---

## Completion Status

- **DONE** — Both systems complete, migration score ≥ 100%, no critical gaps, traceability matrix complete
- **DONE_WITH_CONCERNS** — Gaps found (list them), score below 100%
- **INCOMPLETE** — Phase 5b failed: a phase, form, module, workflow, or role was not tested on one side (list them)
- **NEEDS_CONTEXT** — `--full` without `roles_file`/`roles`, a role without credentials, or `--full` with `dry_run=true`
- **BLOCKED** — Either system's login failed or inventory empty
