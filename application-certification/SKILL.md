---
name: application-certification
description: Full certification of a single web application — discovers, tests every form/field/workflow/permission, calculates coverage, generates defects, Playwright regression scripts, and reports. Orchestrates sub-agents per phase.
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

# /application-certification — Full Application Certification

> **Path resolution:** relative paths in this skill (`shared/...`, `<skill-name>/references/...`, `<skill-name>/templates/...`)
> are relative to the skills root — the folder that contains this skill's folder (normally `~/.claude/skills/`).
> Read them from there, whatever the current working directory is. `install.ps1` / `install.sh` put `shared/` there.


> **⛔ ENFORCEMENT RULE — READ BEFORE ANY ACTION**
>
> This skill MUST perform actual CRUD operations — not just navigation and observation. "Verified" means:
> - **Add**: Form was filled with valid data, submitted, and the new record was confirmed visible in the list
> - **Edit**: A field was changed, saved, and the updated value was confirmed on reload
> - **Delete**: A record was deleted and confirmed absent from the list
> - **Validation**: Required fields were left blank and the correct error message was confirmed
>
> Taking a screenshot of a form that is open is NOT verification. Confirming a button exists is NOT verification. Every CRUD test MUST have before + after screenshots showing the data state changed.
>
> If you find yourself only navigating and screenshotting without performing these operations, you are doing discovery — not certification. Stop and follow the CRUD testing phases below.

Runs a complete, evidence-backed certification of a web application. Discovers all surface area dynamically, executes field-level + CRUD + workflow + permission tests, calculates 6-dimensional coverage, and generates a certification verdict.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `url` | Yes | — | Root URL of the application |
| `username` | Yes | — | Login username |
| `password` | Yes | — | Login password |
| `role` | Yes | — | Primary role being certified |
| `login_mode` | No | `form` | `form` / `cookie` / `script` |
| `dry_run` | No | `false` | Skip all destructive actions (Delete, Approve, Reject) |
| `test_delay_ms` | No | `500` | Milliseconds between test submissions |
| `roles` | No | — | Inline alternative to `roles_file`: `roles=merchant,support merchant_username=.. merchant_password=.. support_username=.. support_password=..` (add `{role}_old_username` / `{role}_old_password` for a different legacy login). Treated exactly like `roles_file` |
| `roles_file` | No | — | JSON file with credentials for additional roles (see `shared/browse-integration.md → Role Credentials File`). Every role in it is tested |
| `role_side` | No | `new` | `legacy` makes every role use its `old_username`/`old_password` from the roles file (falls back to `username`/`password`). Set by `/migration-certification` |
| `scope` | No | — | Comma-separated URL path prefixes — certify only this page/module (see `shared/discovery-engine.md → Scope Filter`) |
| `session_path` | No | — | Resume an existing session (skip discovery if already done) |
| `--quick` | No | flag | Skip paysec review layer, Jira push, and PDF generation |
| `--final` | No | flag | Enable full review layer + Jira + PDFs (use for final sign-off runs) |

## Example Usage

```
/application-certification url=https://app.example.com username=admin password=secret role=admin
/application-certification url=https://app.example.com username=admin password=secret role=admin --final
/application-certification url=https://app.example.com username=admin password=secret role=admin dry_run=true --quick
/application-certification url=https://app.example.com username=admin password=secret role=admin roles_file=./roles.json --final
/application-certification url=https://app.example.com/admin/products username=admin password=secret role=admin scope=/admin/products roles_file=./roles.json --final
```

---

## Preamble

```bash
# ── Session Setup ─────────────────────────────────────────────────────────────
if [ -n "$session_path" ]; then
  SESSION_DIR="$session_path"
  echo "Resuming session: $SESSION_DIR"
else
  SESSION_ID="$(date +%Y%m%d_%H%M%S)_$(echo "$url" | sed 's|https\?://||' | sed 's|[^a-zA-Z0-9]|_|g' | cut -c1-30)"
  SESSION_DIR="$(pwd)/certification-runs/$SESSION_ID"
fi

mkdir -p "$SESSION_DIR/discovery"
mkdir -p "$SESSION_DIR/test-data"
mkdir -p "$SESSION_DIR/test-results/form-tests"
mkdir -p "$SESSION_DIR/test-results/crud-tests"
mkdir -p "$SESSION_DIR/test-results/ui-ux-tests"
mkdir -p "$SESSION_DIR/test-results/workflow-tests"
mkdir -p "$SESSION_DIR/test-results/permission-tests"
mkdir -p "$SESSION_DIR/playwright-regression"
mkdir -p "$SESSION_DIR/evidence/screenshots"
mkdir -p "$SESSION_DIR/evidence/api-logs"
mkdir -p "$SESSION_DIR/evidence/console-logs"
mkdir -p "$SESSION_DIR/defects"
mkdir -p "$SESSION_DIR/coverage"
mkdir -p "$SESSION_DIR/reports"

echo "Session: $SESSION_DIR"
echo "Mode: dry_run=${dry_run:-false} | quick=${quick:-false} | final=${final:-false}"

# ── Checkpoint Check ──────────────────────────────────────────────────────────
CHECKPOINT="$SESSION_DIR/checkpoint.json"
CURRENT_PHASE="discovery"
if [ -f "$CHECKPOINT" ]; then
  CURRENT_PHASE=$(cat "$CHECKPOINT" | grep -o '"phase":"[^"]*"' | cut -d'"' -f4)
  echo "Checkpoint found. Resuming from phase: $CURRENT_PHASE"
fi
```

---

## ORCHESTRATION MODEL

This skill is an orchestrator. It does NOT do the testing itself — it spawns sub-agents for each phase using the Agent tool. Each sub-agent:
1. Receives a specific instruction set
2. Writes results to disk
3. Returns a summary

The orchestrator reads from disk between phases and advances the checkpoint.

This model allows large applications (100+ pages) to be certified without context window exhaustion.

---

## Phase 1 — Discovery

**Skip if `$CURRENT_PHASE != "discovery"` (resuming past this phase).**

Invoke the discover-app skill:
```
/discover-app url={url} username={username} password={password} login_mode={login_mode} roles_file={roles_file} roles={roles} role_side={role_side} scope={scope} session_path={SESSION_DIR}
```

Wait for completion. Verify `{SESSION_DIR}/discovery/inventory.json` exists.

Read the summary from inventory.json:
- Page count, form count, field count, workflow count, API endpoint count

Update checkpoint: `{"phase": "test_data_generation", ...}`

---

## Phase 2 — Test Data Generation

**Skip if resuming past this phase.**

Invoke:
```
/test-data-generator session_path={SESSION_DIR}
```

Wait for completion. Verify `{SESSION_DIR}/test-data/` contains one JSON file per form.

Update checkpoint: `{"phase": "form_testing", ...}`

---

## Phase 3 — Form Testing (Sub-agent per form)

**Skip if resuming past this phase.**

Read `inventory.json` to get all forms.

For each form, spawn a sub-agent using the Agent tool:

```
Agent(
  description: "Form testing: {form.form_name}",
  prompt: "
    You are testing the form '{form.form_name}' on {url}.
    
    Session directory: {SESSION_DIR}
    Form metadata: {form.form_slug}.json (in {SESSION_DIR}/test-data/)
    Browse binary: resolve per shared/browse-integration.md
    
    Follow the instructions in application-certification/references/field-testing-protocol.md exactly.
    
    Login using: username={username}, password={password}, login_mode={login_mode}
    test_delay_ms={test_delay_ms}
    dry_run={dry_run}
    
    Write results to: {SESSION_DIR}/test-results/form-tests/{form.form_slug}-results.json
    Write evidence to: {SESSION_DIR}/evidence/screenshots/ and {SESSION_DIR}/evidence/api-logs/
    
    When done, write a one-line summary: 'Form {form.form_name}: X/Y tests passed'
  "
)
```

Run sub-agents sequentially (not in parallel) to avoid browser session conflicts and rate limiting.

After all forms: Update checkpoint `{"phase": "ui_ux_testing", ...}`

---

## Phase 3b — UI/UX Testing (Sub-agent per form)

**Skip if resuming past this phase.**

**Purpose:** Catch UI/UX issues that functional tests miss — submit button stuck after valid fill,
no field highlighting on error, missing required-field indicators, toast-only errors, empty states.
These checks are run once per form, independently of the field-by-field test cases in Phase 3.

Read `inventory.json` to get all forms.

For each form, spawn a sub-agent:

```
Agent(
  description: "UI/UX testing: {form.form_name}",
  prompt: "
    You are running UI/UX checks on the form '{form.form_name}' on {url}.

    Session directory: {SESSION_DIR}
    Form metadata: {form.form_slug}.json (in {SESSION_DIR}/test-data/)
    Browse binary: resolve per shared/browse-integration.md

    Follow the instructions in application-certification/references/ui-ux-testing.md exactly.
    Run all 9 checks in order. Do not skip any check.

    Login using: username={username}, password={password}, login_mode={login_mode}

    Write results to: {SESSION_DIR}/test-results/ui-ux-tests/{form.form_slug}-uiux-results.json
    Write evidence screenshots to: {SESSION_DIR}/evidence/screenshots/

    When done, write a one-line summary:
    'UI/UX {form.form_name}: X/9 checks passed — [list any defects found]'
  "
)
```

Run sub-agents sequentially.

After all forms: Update checkpoint `{"phase": "crud_testing", ...}`

---

## Phase 4 — CRUD Testing (Sub-agent per module)

**Skip if resuming past this phase.**

Read `inventory.json` to get all tables (each table = one module).

For each table/module, spawn a sub-agent:

```
Agent(
  description: "CRUD testing: {table.table_name}",
  prompt: "
    You are testing the '{table.table_name}' module on {url}.
    
    Session directory: {SESSION_DIR}
    Table metadata: from inventory.json (see {SESSION_DIR}/discovery/inventory.json, table_id={table.id})
    
    Follow application-certification/references/crud-testing.md exactly.
    
    Login: username={username}, password={password}
    dry_run={dry_run}
    test_delay_ms={test_delay_ms}
    
    Write results to: {SESSION_DIR}/test-results/crud-tests/{table_slug}-results.json
  "
)
```

After all modules: Update checkpoint `{"phase": "workflow_testing", ...}`

---

## Phase 5 — Workflow Testing (Sub-agent per workflow)

**Skip if resuming past this phase.**

Read `inventory.json` to get all workflows.

For each workflow, spawn a sub-agent:

```
Agent(
  description: "Workflow testing: {workflow.name}",
  prompt: "
    Test workflow '{workflow.name}' on {url}.
    Workflow descriptor: {JSON.stringify(workflow)}
    
    Follow application-certification/references/workflow-testing.md exactly.
    
    Login: username={username}, password={password}
    dry_run={dry_run}
    
    Write results to: {SESSION_DIR}/test-results/workflow-tests/{workflow_slug}-results.json
  "
)
```

After all workflows: Update checkpoint `{"phase": "permission_testing", ...}`

---

## Phase 6 — Permission Testing (Sub-agent per role)

**Skip if resuming past this phase.** Always test the primary role. If `roles_file` is provided, also test every role in it — no role may be skipped.

For each role (the primary role plus every role in `roles_file`), spawn a sub-agent:

```
Agent(
  description: "Permission testing: role={role_name}",
  prompt: "
    Test all permissions for role '{role_name}' on {url}.
    
    Credentials for {role_name}: from roles_file (never write them to results or logs)
    Expected access for {role_name}: {roles_file.roles[role_name].expected or 'not specified — record outcomes as observed'}
    Full inventory: {SESSION_DIR}/discovery/inventory.json
    
    Follow application-certification/references/permission-testing.md exactly.
    
    Write results to: {SESSION_DIR}/test-results/permission-tests/{role_name}-matrix.json
  "
)
```

After all roles: Update checkpoint `{"phase": "coverage_calculation", ...}`

---

## Phase 7 — Playwright Regression Script Generation

Read all form test results. For each form that has test results:

Spawn one sub-agent:
```
Agent(
  description: "Generate Playwright regression scripts",
  prompt: "
    Generate Playwright .spec.ts regression test files for all tested forms.
    
    Test results directory: {SESSION_DIR}/test-results/form-tests/
    Inventory: {SESSION_DIR}/discovery/inventory.json
    App URL: {url}
    
    Follow the Playwright script template in shared/browse-integration.md → Generated Playwright Script Output.
    
    Write one .spec.ts file per form to: {SESSION_DIR}/playwright-regression/
  "
)
```

---

## Phase 8 — Coverage Calculation

Read all test result files from `test-results/`.

For each coverage dimension, apply the formulas from `shared/coverage-tracker.md`.

**UI/UX coverage** = checks passed / applicable checks across all `ui-ux-tests/*.json` files.
Each form contributes 9 checks, minus any recorded as `"applicable": false`. A form that wasn't UI/UX tested counts as 0/9.
See `shared/coverage-tracker.md → UI/UX Coverage`.

Write 7 coverage JSON files to `{SESSION_DIR}/coverage/` (add `ui-ux-coverage.json`).

Print coverage summary:
```
[COVERAGE SUMMARY]
Page Coverage:        12/12 (100.0%) ✅
Form Coverage:         7/8  ( 87.5%) ❌  — form_007 not covered
Field Coverage:       47/47 (100.0%) ✅
UI/UX Coverage:       63/72 ( 87.5%) ❌  — 2 forms have stuck submit + no field highlight
Workflow Coverage:     3/3  (100.0%) ✅
Permission Coverage:  24/24 (100.0%) ✅
API Coverage:         18/22 ( 81.8%) ✅  (≥80% gate)
```

**Health score formula (7 dimensions, equal weight — same formula as `scoring-rubric.md`):**
```
score = (page_pct + form_pct + field_pct + uiux_pct + workflow_pct + permission_pct + api_pct) / 7
```

---

## Phase 9 — Defect Aggregation

Read all test result files from `test-results/form-tests/`, `test-results/crud-tests/`,
and `test-results/ui-ux-tests/`. Collect every failed test case and UI/UX check.

For each failed test, create a defect record using the schema from `shared/output-schemas.md → defects.json`.

Apply severity rules from `application-certification/references/scoring-rubric.md → Auto-Severity Assignment Rules` exactly — this now covers both functional and UI/UX defect types.

Key UI/UX defect titles to look for when aggregating:
- "Submit button stays disabled after valid form fill" → High
- "Field not highlighted on validation error" → High
- "Validation feedback is toast-only" → Medium
- "Required field has no visual marker" → Medium
- "Error message too vague to guide user" → Medium
- "No empty state message when list has zero results" → Medium

Write to `{SESSION_DIR}/defects/defects.json`.

---

## Phase 10 — Certification Verdict

Calculate health score (7 dimensions, equal weights — the same formula as Phase 8):
```
score = (page_pct + form_pct + field_pct + uiux_pct + workflow_pct + permission_pct + api_pct) / 7
```
Then apply the defect penalty from `scoring-rubric.md → Score Adjustment for Defects`.

Evaluate all 9 gates per `application-certification/references/certification-criteria.md` (7 coverage gates, including GATE_UIUX_COV, plus critical defects and evidence).

Set `verdict = "PASS"` only if ALL gates pass.
If ANY gate fails: `verdict = "FAIL"`.

Write `{SESSION_DIR}/certification-result.json`.

---

## Phase 11 — paysec Review Layer (--final only)

**Skip unless `--final` flag is set.**

Invoke these paysec skills sequentially, passing the session's `certification-result.json` and `defects/defects.json` as context:
1. `/qa-report` — independent report-only QA pass: defect severity assessment and anything the certification missed. (Never `/qa-fix` here — certification must not modify the application under test.)
2. `/plan-tech-review` — engineering review of the findings: architectural risks from API contract violations and failing gates
3. `/plan-business-review` — executive go-live recommendation

Append each review's summary to `certification-result.json → paysec_review` (`qa_summary`, `eng_review_summary`, `ceo_review_summary`).

---

## Phase 12 — Jira + Reports (--final only)

**Skip unless `--final` flag is set.**

1. Check Jira configuration (env vars JIRA_URL, JIRA_API_TOKEN, JIRA_PROJECT_KEY)
2. Invoke `/generate-jira-bugs session_path={SESSION_DIR}`
3. Invoke `/generate-pdf-report session_path={SESSION_DIR}`

---

## Final Output

```
╔══════════════════════════════════════════════════════╗
║        APPLICATION CERTIFICATION RESULT              ║
╠══════════════════════════════════════════════════════╣
║  URL:     https://app.example.com                    ║
║  Role:    admin                                      ║
║  Score:   87/100                                     ║
║  Verdict: FAIL                                       ║
╠══════════════════════════════════════════════════════╣
║  Page Coverage:       100.0% ✅                      ║
║  Form Coverage:        87.5% ❌  (form_007 missing)  ║
║  Field Coverage:      100.0% ✅                      ║
║  UI/UX Coverage:       87.5% ❌  (stuck submit × 2) ║
║  Workflow Coverage:   100.0% ✅                      ║
║  Permission Coverage: 100.0% ✅                      ║
║  API Coverage:         81.8% ✅                      ║
╠══════════════════════════════════════════════════════╣
║  Critical Defects: 0  High: 1  Medium: 2  Low: 0    ║
╠══════════════════════════════════════════════════════╣
║  Session: certification-runs/20260611_142200_...     ║
╚══════════════════════════════════════════════════════╝
```

---

## Completion Status

- **DONE** — All phases complete, verdict written, coverage at 100%
- **DONE_WITH_CONCERNS** — Verdict is FAIL (list failing gates) or coverage < 100% (list gaps)
- **BLOCKED** — Login failed, browse binary missing, or inventory.json not produced
- **NEEDS_CONTEXT** — `roles_file` provided but missing, unreadable, or a role in it has no username/password

---

## Telemetry

```bash
~/.claude/skills/paysec/bin/paysec-timeline-log "{\"skill\":\"application-certification\",\"event\":\"completed\",\"session\":\"$SESSION_ID\",\"verdict\":\"$VERDICT\",\"score\":$SCORE}" 2>/dev/null || true
```
