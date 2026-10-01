# Certification Criteria — Hard Gates and Verdict Rules

This file defines what constitutes "covered" for each dimension and what must be true for a PASS verdict.

---

## Gate Definitions

### GATE_PAGE_COV — Page Coverage = 100%

A page is **covered** when:
1. It was navigated to during testing (not just discovered)
2. At least ONE of the following occurred:
   - A form on the page was submitted
   - A table row action was executed
   - A button with a side effect was clicked
   - A screenshot was captured showing non-empty content

A page with only a screenshot is NOT covered — an action must have been taken.

**Exception:** Pages whose only content is informational (no interactive elements) — a screenshot confirming content is visible counts as coverage.

### GATE_FORM_COV — Form Coverage = 100%

A form is **covered** when:
1. It was submitted at least once with ALL required fields filled with valid data
2. The success outcome was observed and documented
3. At least one screenshot of the success state exists

A form is NOT covered if it was only partially filled or only negative tests were run.

### GATE_FIELD_COV — Field Coverage = 100%

A field is **covered** when ALL applicable test types have been executed:

**Required for all non-hidden fields:**
- `positive_valid` ✓
- `negative_blank` (required fields only) ✓
- `special_chars` ✓

**Required for fields with format constraints (email, number, date, tel, url):**
- `negative_invalid_format` ✓

**Required for fields with min/max constraints:**
- `boundary_min` ✓
- `boundary_max` ✓
- `boundary_over` ✓

**Required for fields with `depends_on`:**
- `dependency_violation` ✓

A form is NOT marked as form-covered until every field in it is field-covered.

### GATE_UIUX_COV — UI/UX Coverage = 100%

A UI/UX check (one of the 9 per form in `ui-ux-testing.md`) is **covered** when:
1. It was run against the form in Phase 3b
2. It passed, OR it is listed in `acknowledged-unreachable.json` with `item_type: "uiux"` and a specific justification
3. Its result is backed by at least one screenshot in `evidence_screenshots[]`

Checks recorded as `"applicable": false` (nothing on the form for the check to inspect) are removed from the denominator. A failing check is never "not applicable".

A form that was not UI/UX tested at all fails this gate (0/9).

### GATE_WORKFLOW_COV — Workflow Coverage = 100%

A workflow is **covered** when:
1. The success path was executed completely (reached a terminal state)
2. At least one failure path was executed (an error was triggered and the workflow did not complete)
3. If the workflow has an audit log: an entry was verified after the success execution
4. If the workflow sends notifications: a notification was verified (or noted as untestable with justification)

### GATE_PERMISSION_COV — Permission Coverage = 100%

A permission combination (role × resource) is **covered** when:
1. Login as that role was successfully completed
2. The resource (page URL or action) was directly accessed or attempted
3. The outcome (allowed/denied) was recorded with HTTP status code evidence
4. A screenshot exists for both an allowed access and at least one denied access per role

### GATE_API_COV — API Coverage ≥ 80%

API coverage requires less than the other dimensions because:
- Some internal API endpoints are never directly triggered by UI actions
- Batch/background endpoints may only fire under load

An API endpoint is **covered** when:
1. The endpoint was called at least once during testing
2. The response status code matched the expected status (e.g., 201 for create, 200 for read, 422 for validation error)

### GATE_CRITICAL_DEFECTS — Critical Defects = 0

Critical defects are defined as:
- **Validation bypass:** A form accepts and processes invalid data that should be rejected
- **Authentication bypass:** A role accesses a resource it should not have access to
- **Data loss:** A delete/overwrite operation loses data without confirmation or recovery
- **Unhandled crash:** The application throws an unhandled exception or shows an error page during normal operation
- **Calculation error:** A computed value (total, balance, percentage) is mathematically wrong

If ANY critical defect exists, verdict = FAIL regardless of coverage scores.

### GATE_EVIDENCE — Evidence Complete

Evidence is complete when:
- Every test result entry has at least one `evidence_screenshots[]` path
- Every screenshot path points to an existing file on disk
- At least one API log exists per form that submits to an API endpoint

---

## Acknowledged Unreachable Rules

Items can be excluded from the coverage denominator ONLY under these conditions:

1. The justification must be SPECIFIC (not "couldn't test it")
2. Acceptable reasons:
   - Feature flag not enabled in test environment
   - Requires hardware (real SMS, hardware key) not available in test
   - Error state only reachable after infrastructure failure
   - Third-party integration (payment gateway, OAuth) in sandbox mode that doesn't surface the full UI
3. NOT acceptable:
   - "Time ran out"
   - "Not important"
   - "Skipped"
   - Any reason that could be fixed by better test setup

Maximum 10% of any dimension can be acknowledged without requiring human sign-off. Above 10%: flag as DONE_WITH_CONCERNS and include a note asking a human to review the acknowledgements.

---

## Verdict Rule (ABSOLUTE)

```
IF gate_page_cov AND gate_form_cov AND gate_field_cov AND gate_uiux_cov AND
   gate_workflow_cov AND gate_permission_cov AND gate_api_cov AND
   gate_critical_defects AND gate_evidence:
   verdict = "PASS"
ELSE:
   verdict = "FAIL"
   list every failing gate
   list every uncovered item
```

**There is no partial pass.** A score of 99/100 with one failing gate = FAIL.

---

## Defect Severity Classification

| Severity | Definition | Examples |
|----------|-----------|---------|
| **Critical** | Blocks go-live unconditionally | Validation bypass, auth bypass, crash, wrong calculation |
| **High** | Core feature non-functional | Feature unavailable, data not saved, required action broken |
| **Medium** | Feature works but incorrectly or incompletely | Wrong error message, minor data display error, UI inconsistency |
| **Low** | Cosmetic or very minor | Typo, alignment issue, missing tooltip |
