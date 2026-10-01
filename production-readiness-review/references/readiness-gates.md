# Readiness Gates — Complete Gate List and Evaluation Instructions

Each gate must be evaluated independently. One failing gate = FAIL verdict. No exceptions.

---

## GATE_PAGE_COV — Page Coverage

**Check:** Read `coverage/page-coverage.json`
**Formula:** `(covered + acknowledged_unreachable) / total`
**Passes when:** result = 1.0 (100%)
**Failing evidence required:** List every item where `status = "not_covered"` with its URL and title

---

## GATE_FORM_COV — Form Coverage

**Check:** Read `coverage/form-coverage.json`
**Formula:** `(covered + acknowledged_unreachable) / total`
**Passes when:** result = 1.0 (100%)
**Failing evidence:** List every uncovered form with its name, page URL, and trigger button

---

## GATE_FIELD_COV — Field Coverage

**Check:** Read `coverage/field-coverage.json`
**Formula:** `(covered + acknowledged_unreachable) / total` (across all fields, all forms)
**Passes when:** result = 1.0 (100%)
**Failing evidence:** List every uncovered field with its form name and field type

Note: A form can be form-covered but have field-coverage gaps if individual field tests were skipped.

---

## GATE_UIUX_COV — UI/UX Coverage

**Check:** Read `coverage/ui-ux-coverage.json`
**Formula:** `(passed_checks + acknowledged_unreachable) / applicable_checks` (9 checks per form, minus checks recorded as `"applicable": false`)
**Passes when:** result = 1.0 (100%)
**Failing evidence:** List every failed or unrun check as `form name — check name — what was observed`

Note: Each failed check also appears in `defects.json` (severity from `scoring-rubric.md`). The gate fails even when those defects are only Medium — an accepted known issue must go in `acknowledged-unreachable.json` with a justification to pass.

---

## GATE_WORKFLOW_COV — Workflow Coverage

**Check:** Read `coverage/workflow-coverage.json`
**Formula:** `(covered + acknowledged_unreachable) / total`
**Passes when:** result = 1.0 (100%)
**Failing evidence:** List every uncovered workflow with its name and trigger

---

## GATE_PERMISSION_COV — Permission Coverage

**Check:** Read `coverage/permission-coverage.json`
**Formula:** `(covered + acknowledged_unreachable) / total`
**Passes when:** result = 1.0 (100%)
**Failing evidence:** List every untested role × resource combination

---

## GATE_API_COV — API Coverage

**Check:** Read `coverage/api-coverage.json`
**Formula:** `(covered + acknowledged_unreachable) / total`
**Passes when:** result ≥ 0.80 (80%)
**Rationale for 80% threshold:** Some internal, background, or batch endpoints may never be triggered by UI interactions in a functional test. These are explicitly exempted. However, all UI-triggered endpoints must be covered.
**Failing evidence:** List every uncovered endpoint with method and path

---

## GATE_CRITICAL_DEFECTS — Zero Critical Defects

**Check:** Read `defects/defects.json`
**Calculation:** Count items where `severity = "critical"`
**Passes when:** count = 0
**Failing evidence:** List every critical defect with ID, title, form/page, and test type

Critical defect categories (any = gate fails):
- Validation bypass (required field accepts empty, email field accepts non-email, etc.)
- Authentication bypass (user can login without valid credentials)
- Authorization bypass (role X can access resource restricted to role Y)
- Unhandled exception (HTTP 500 during normal user operation)
- Data loss (delete without confirmation, overwrite without warning)
- Incorrect calculation (any computed numeric value is mathematically wrong)
- Data exposure (user can see another user's private data)

---

## GATE_EVIDENCE — Evidence Completeness

**Check:** Iterate all test result JSON files in `test-results/`
**Passes when:** Every test case entry has:
  1. `evidence_screenshots` array with at least 1 path
  2. Each screenshot path resolves to an existing file on disk

```bash
# Verification command
find certification-runs/SESSION_DIR/test-results -name "*.json" | while read f; do
  jq -r '.test_cases[]? | select((.evidence_screenshots | length) == 0) | "\(.test_id) — no screenshot"' "$f"
done
```

**Failing evidence:** List every test case ID with missing evidence

---

## GATE_ACKNOWLEDGED — Valid Acknowledgements

**Check:** Read `coverage/acknowledged-unreachable.json` (if it exists)
**Passes when:** Every acknowledged item has:
  1. Non-empty `justification` field (not "", not null, not "skip", not "unknown")
  2. Valid `item_type` from the allowed list
  3. `acknowledged_at` timestamp

**If `acknowledged-unreachable.json` does not exist:** Gate passes automatically.

**High acknowledgement warning:** If `acknowledged_unreachable / total > 10%` for any dimension:
→ Gate still passes if justifications are valid
→ BUT: flag with `"high_acknowledgement_warning": true` in the result
→ AND: recommend human review of all acknowledgements

---

## Gate Evaluation Order

Evaluate gates in this order (to produce the most actionable error message):

1. GATE_EVIDENCE (if evidence is missing, all other results are suspect)
2. GATE_CRITICAL_DEFECTS (critical defects are highest priority fix)
3. GATE_PAGE_COV
4. GATE_FORM_COV
5. GATE_FIELD_COV
6. GATE_UIUX_COV
7. GATE_WORKFLOW_COV
8. GATE_PERMISSION_COV
9. GATE_API_COV
10. GATE_ACKNOWLEDGED

---

## Conditions for Pass Output

When listing "conditions to achieve PASS," provide SPECIFIC actionable items:

**Good:**
- "Test form_007 (Bulk Import, /merchants/import) — it was discovered but no test data was generated"
- "Fix DEF_001: Email field accepts invalid format — validation bypass (Critical)"
- "Add screenshot evidence for test form_001_field_003_boundary_max"

**Bad:**
- "Improve coverage"
- "Fix defects"
- "Add more tests"
