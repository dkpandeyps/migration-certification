---
name: production-readiness-review
description: Evaluates whether an application is ready for production by checking all certification gates — coverage, defects, and evidence completeness. Outputs a binary PASS/FAIL verdict with explicit gap list and residual risks.
version: 1.0.0
preamble-tier: 1
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# /production-readiness-review — Production Go/No-Go Assessment

> **Path resolution:** relative paths in this skill (`shared/...`, `<skill-name>/references/...`, `<skill-name>/templates/...`)
> are relative to the skills root — the folder that contains this skill's folder (normally `~/.claude/skills/`).
> Read them from there, whatever the current working directory is. `install.ps1` / `install.sh` put `shared/` there.


Reads certification artifacts and evaluates every gate. Outputs a binary PASS/FAIL verdict. Will NEVER output PASS unless every gate passes. Always explicitly lists what was not covered.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `session_path` | Yes* | — | Path to an existing `certification-runs/{id}` directory |
| `url` | Yes* | — | Run fresh certification if `session_path` not provided |
| `username` | No | — | Required if `url` provided |
| `password` | No | — | Required if `url` provided |
| `role` | No | — | Required if `url` provided |

*One of `session_path` or `url` must be provided.

## Example Usage

```
/production-readiness-review session_path=./certification-runs/20260611_142200_myapp
/production-readiness-review url=https://app.example.com username=admin password=secret role=admin
```

---

## Preamble

```bash
if [ -z "$session_path" ] && [ -z "$url" ]; then
  echo "ERROR: Provide session_path or (url + username + password + role)"
  exit 1
fi

# If only url provided, run a fresh certification first
if [ -z "$session_path" ] && [ -n "$url" ]; then
  echo "No session_path provided — running /application-certification first..."
  /application-certification url="$url" username="$username" password="$password" role="$role" --quick
  # The above sets SESSION_DIR; read it from the last run
  session_path=$(ls -td certification-runs/*/ | head -1)
fi

SESSION_DIR="$session_path"
echo "Evaluating session: $SESSION_DIR"

# Verify required files exist
REQUIRED_FILES=(
  "$SESSION_DIR/certification-result.json"
  "$SESSION_DIR/coverage/page-coverage.json"
  "$SESSION_DIR/coverage/form-coverage.json"
  "$SESSION_DIR/coverage/field-coverage.json"
  "$SESSION_DIR/coverage/ui-ux-coverage.json"
  "$SESSION_DIR/coverage/workflow-coverage.json"
  "$SESSION_DIR/coverage/permission-coverage.json"
  "$SESSION_DIR/coverage/api-coverage.json"
  "$SESSION_DIR/defects/defects.json"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: Required file missing: $f"
    echo "Run /application-certification first."
    exit 1
  fi
done
```

---

## Gate Evaluation

Read each required file and evaluate every gate. Follow the definitions in `references/readiness-gates.md`.

### Evaluate Each Gate

**GATE_PAGE_COV:**
```bash
PAGE_COVERED=$(cat "$SESSION_DIR/coverage/page-coverage.json" | jq '.covered')
PAGE_ACKNOWLEDGED=$(cat "$SESSION_DIR/coverage/page-coverage.json" | jq '.acknowledged_unreachable')
PAGE_TOTAL=$(cat "$SESSION_DIR/coverage/page-coverage.json" | jq '.total')
PAGE_EFFECTIVE=$(echo "$PAGE_COVERED + $PAGE_ACKNOWLEDGED" | bc)
GATE_PAGE_COV=$([ "$PAGE_EFFECTIVE" = "$PAGE_TOTAL" ] && echo "true" || echo "false")
```

Repeat for GATE_FORM_COV, GATE_FIELD_COV, GATE_UIUX_COV (`ui-ux-coverage.json` — counts passing checks, see `references/readiness-gates.md`), GATE_WORKFLOW_COV, GATE_PERMISSION_COV.

**GATE_API_COV (≥ 80%):**
```bash
API_PCT=$(cat "$SESSION_DIR/coverage/api-coverage.json" | jq '.percentage')
GATE_API_COV=$(echo "$API_PCT >= 80" | bc -l | grep -c "^1$" | grep -q "1" && echo "true" || echo "false")
```

**GATE_CRITICAL_DEFECTS:**
```bash
CRITICAL_COUNT=$(cat "$SESSION_DIR/defects/defects.json" | jq '[.defects[] | select(.severity=="critical")] | length')
GATE_CRITICAL_DEFECTS=$([ "$CRITICAL_COUNT" = "0" ] && echo "true" || echo "false")
```

**GATE_EVIDENCE:**
Check every test result file — verify at least one screenshot path exists and the file is present on disk:
```bash
EVIDENCE_INCOMPLETE=$(find "$SESSION_DIR/test-results" -name "*.json" -exec jq -r '.test_cases[]? | select((.evidence_screenshots | length) == 0) | .test_id' {} \; | wc -l)
GATE_EVIDENCE=$([ "$EVIDENCE_INCOMPLETE" = "0" ] && echo "true" || echo "false")
```

**GATE_ACKNOWLEDGED:**
```bash
if [ -f "$SESSION_DIR/coverage/acknowledged-unreachable.json" ]; then
  INVALID_JUSTIFICATIONS=$(cat "$SESSION_DIR/coverage/acknowledged-unreachable.json" | jq '[.items[] | select(.justification == "" or .justification == null)] | length')
  GATE_ACKNOWLEDGED=$([ "$INVALID_JUSTIFICATIONS" = "0" ] && echo "true" || echo "false")
else
  GATE_ACKNOWLEDGED="true"  # No acknowledgements = gate passes
fi
```

---

## Verdict Determination

**ABSOLUTE RULE: You MUST NOT output verdict=PASS unless EVERY gate listed below evaluates to true.**
**If uncertain about any gate, output FAIL with explanation.**

```bash
if [ "$GATE_PAGE_COV" = "true" ] && \
   [ "$GATE_FORM_COV" = "true" ] && \
   [ "$GATE_FIELD_COV" = "true" ] &&    [ "$GATE_UIUX_COV" = "true" ] && \
   [ "$GATE_WORKFLOW_COV" = "true" ] && \
   [ "$GATE_PERMISSION_COV" = "true" ] && \
   [ "$GATE_API_COV" = "true" ] && \
   [ "$GATE_CRITICAL_DEFECTS" = "true" ] && \
   [ "$GATE_EVIDENCE" = "true" ] && \
   [ "$GATE_ACKNOWLEDGED" = "true" ]; then
  VERDICT="PASS"
else
  VERDICT="FAIL"
fi
```

---

## Uncovered Items Report

If VERDICT = FAIL, list every item that caused the failure:

```bash
# Collect all not_covered items from all coverage files
for DIMENSION in page form field ui-ux workflow permission api; do
  NOT_COVERED=$(cat "$SESSION_DIR/coverage/${DIMENSION}-coverage.json" | jq '.not_covered_items[]')
  # Format: "DIMENSION: item_name — reason"
done
```

---

## Write production-readiness-result.json

```json
{
  "session_id": "...",
  "target_url": "https://app.example.com",
  "evaluated_at": "2026-06-11T19:00:00Z",
  "verdict": "FAIL",
  "score": 87,

  "gates": {
    "page_coverage":       {"required": "100%", "actual": "100.0%", "passed": true},
    "form_coverage":       {"required": "100%", "actual": "87.5%",  "passed": false, "failing_items": ["form_007: Bulk Import Form"]},
    "field_coverage":      {"required": "100%", "actual": "100.0%", "passed": true},
    "uiux_coverage":       {"required": "100%", "actual": "100.0%", "passed": true},
    "workflow_coverage":   {"required": "100%", "actual": "100.0%", "passed": true},
    "permission_coverage": {"required": "100%", "actual": "100.0%", "passed": true},
    "api_coverage":        {"required": "≥80%", "actual": "90.9%",  "passed": true},
    "critical_defects":    {"required": 0,      "actual": 0,        "passed": true},
    "evidence_complete":   {"required": true,   "actual": true,     "passed": true},
    "acknowledgements_valid": {"required": true, "actual": true,    "passed": true}
  },

  "uncovered_items": [
    {
      "type": "form",
      "id": "form_007",
      "name": "Bulk Import Form",
      "page_url": "/merchants/import",
      "reason": "Not tested — form was discovered but no test data was generated for it",
      "action_required": "Run /test-data-generator and re-run form testing for form_007"
    }
  ],

  "residual_risks": [
    {
      "risk_id": "RR_001",
      "type": "coverage_gap_risk",
      "description": "1 acknowledged unreachable item (server error page) — may hide defects in error handling code",
      "likelihood": "low",
      "impact": "medium",
      "mitigation_suggestion": "Review error handling code manually or trigger error conditions in a separate environment"
    }
  ],

  "conditions_for_pass": [
    "Test Bulk Import form (form_007) — it was discovered but not tested",
    "Resolve all 3 High defects or document acceptance"
  ],

  "defect_summary": {
    "critical": 0, "high": 3, "medium": 1, "low": 0
  }
}
```

---

## Final Output

```
╔══════════════════════════════════════════════════════╗
║        PRODUCTION READINESS ASSESSMENT               ║
╠══════════════════════════════════════════════════════╣
║  Verdict:  ❌ NOT PRODUCTION READY                   ║
║  Score:    87/100                                    ║
╠══════════════════════════════════════════════════════╣
║  Gates:                                              ║
║  ✅ Page Coverage:       100.0% (required: 100%)     ║
║  ❌ Form Coverage:        87.5% (required: 100%)     ║
║  ✅ Field Coverage:      100.0% (required: 100%)     ║
║  ✅ UI/UX Coverage:      100.0% (required: 100%)     ║
║  ✅ Workflow Coverage:   100.0% (required: 100%)     ║
║  ✅ Permission Coverage: 100.0% (required: 100%)     ║
║  ✅ API Coverage:         90.9% (required: ≥80%)     ║
║  ✅ Critical Defects:     0     (required: 0)        ║
║  ✅ Evidence Complete:   true   (required: true)     ║
╠══════════════════════════════════════════════════════╣
║  NOT COVERED (1 item):                               ║
║    - form_007: Bulk Import Form (/merchants/import)  ║
╠══════════════════════════════════════════════════════╣
║  To achieve PASS, fix:                               ║
║    1. Test Bulk Import form (form_007)               ║
╚══════════════════════════════════════════════════════╝
```

---

## Completion Status

- **DONE** — Verdict is PASS, all gates passed
- **DONE_WITH_CONCERNS** — Verdict is FAIL (always list failing gates and uncovered items)
- **BLOCKED** — Required certification files are missing
