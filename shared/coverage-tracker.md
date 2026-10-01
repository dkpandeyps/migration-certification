# Coverage Tracker — Formulas, Update Protocol, and Gates

Coverage is a first-class concept in this framework. Every skill must update coverage as it runs. Never declare anything "tested" without updating the coverage map.

---

## Seven Coverage Dimensions

### 1. Page Coverage
**Denominator:** Total pages in `inventory.json → pages[]`
**Covered when:** The page was navigated to AND at least one meaningful action was taken (form submitted, table row opened, button clicked, or screenshot captured showing non-empty content)

### 2. Form Coverage
**Denominator:** Total forms in `inventory.json → forms[]`
**Covered when:** The form was submitted at least once with a complete valid input set AND the success outcome was verified

### 3. Field Coverage
**Denominator:** Total fields across all forms in `inventory.json`
**Covered when:** Every field has been exercised with ALL of the following test types: `positive_valid`, `negative_blank` (if required), `negative_invalid_format`, `boundary_min`, `boundary_max`, `special_chars`

A form is NOT marked covered until every one of its fields is covered.

### 4. UI/UX Coverage
**Denominator:** 9 checks × total forms in `inventory.json → forms[]`, minus checks recorded as `"applicable": false`
- A check is not applicable only when the form has nothing for it to inspect (e.g. `empty_state` on a form with no list, `disabled_clarity` on a form with no disabled fields). Record it as `{"passed": null, "applicable": false, "reason": "..."}`
- A form that was never UI/UX tested contributes 0/9 — its checks stay in the denominator
**Covered when:** The check was run on the form AND passed (see `application-certification/references/ui-ux-testing.md`)

Unlike the other dimensions, UI/UX counts *passing* checks, not just executed ones — a failed check is both a defect and a coverage gap.

### 5. Workflow Coverage
**Denominator:** Total workflows in `inventory.json → workflows[]`
**Covered when:** The workflow was executed on BOTH the success path (reached a terminal state) AND at least one failure path (error was triggered and recovery was tested)

### 6. Permission Coverage
**Denominator:** Total (role × resource) pairs where a resource is any page or action
- Resources = pages + table row actions + form submit buttons + API endpoints
- For N roles and M resources: denominator = N × M
**Covered when:** Every role × resource combination has been explicitly tested (access confirmed or denied and verified)

### 7. API Coverage
**Denominator:** Total unique API endpoints in `inventory.json → api_endpoints[]`
- APIs only triggered by features behind known unreachable states are acknowledgeable
- Minimum required: 80% (not 100% — unlike other dimensions, some internal APIs may never surface in UI flows)
**Covered when:** The endpoint was called at least once AND the response status code was verified

---

## Coverage Calculation Formula

For all dimensions except API:
```
coverage_pct = (covered + acknowledged_unreachable) / total * 100
```

For API:
```
coverage_pct = (covered + acknowledged_unreachable) / total * 100
gate_passes   = coverage_pct >= 80
```

Round to one decimal place.

---

## How to Mark an Item as Covered

After completing a test for an item, update `coverage-map.json` immediately:

```json
{
  "id": "page_001",
  "status": "covered",
  "covered_at": "2026-06-11T15:00:00Z",
  "covered_by_test": "form_test_DEF_001"
}
```

Write the updated `coverage-map.json` to disk after each item is covered — do not batch updates.

---

## Acknowledged Unreachable Protocol

When an item genuinely cannot be reached in the test environment:

1. **Identify** the item (page_id, form_id, field_id, workflow_id, etc.)
2. **Write justification** — must be a specific reason, not "couldn't reach it"

   Acceptable justifications:
   - "Error page only reachable after server 500 — not reproducible in isolated test env"
   - "Bulk import feature behind feature flag `FEATURE_BULK_IMPORT=true` — not enabled in this environment"
   - "SMS verification step requires real phone carrier — mocked in test env"

   NOT acceptable:
   - "Skipped"
   - "Not tested"
   - "Unknown"

3. **Write to `coverage/acknowledged-unreachable.json`**:
```json
{
  "items": [
    {
      "item_id": "page_009",
      "item_type": "page | form | field | uiux | workflow | permission | api",
      "item_name": "Server Error Page",
      "justification": "Only reachable after unhandled exception — cannot be reliably triggered",
      "acknowledged_at": "2026-06-11T15:30:00Z",
      "acknowledged_by": "system"
    }
  ]
}
```

4. **Update `coverage-map.json`** for the item: set `status = "acknowledged_unreachable"`

---

## Coverage Report Calculation

At the end of any certification phase, calculate and write `coverage/` directory files:

```json
// coverage/page-coverage.json
{
  "dimension": "page",
  "total": 12,
  "covered": 10,
  "acknowledged_unreachable": 1,
  "not_covered": 1,
  "percentage": 91.7,
  "gate_required": 100,
  "gate_passed": false,
  "not_covered_items": [
    {"id": "page_007", "name": "Batch Upload Result", "reason": "dependent on batch job completion"}
  ]
}
```

Write one file per dimension: `page-coverage.json`, `form-coverage.json`, `field-coverage.json`, `ui-ux-coverage.json`, `workflow-coverage.json`, `permission-coverage.json`, `api-coverage.json`.

For `ui-ux-coverage.json`, `total`/`covered` count checks (not forms), and each `not_covered_items[]` entry is one failed or unrun check: `{"id": "form_003:field_highlight_on_error", "name": "Create Product — Field highlight on error", "reason": "No field highlighted after invalid submit"}`.

---

## Production Readiness Gate Check

Read all 7 coverage files. For each dimension:

| Dimension | Gate | Passes When |
|-----------|------|-------------|
| page | = 100% | (covered + acknowledged) / total = 1.0 |
| form | = 100% | (covered + acknowledged) / total = 1.0 |
| field | = 100% | (covered + acknowledged) / total = 1.0 |
| uiux | = 100% | (passed + acknowledged) / applicable checks = 1.0 |
| workflow | = 100% | (covered + acknowledged) / total = 1.0 |
| permission | = 100% | (covered + acknowledged) / total = 1.0 |
| api | >= 80% | (covered + acknowledged) / total >= 0.8 |

If ANY dimension fails its gate:
- Set `verdict = "FAIL"` in `certification-result.json`
- Explicitly list every `not_covered` item in `uncovered_items[]`
- NEVER set `verdict = "PASS"` while any coverage gate is failing

---

## Progress Reporting

During test execution, print coverage progress after every completed test:

```
[COVERAGE] Page: 8/12 (66.7%) | Form: 3/8 (37.5%) | Field: 22/47 (46.8%) | UI/UX: 18/27 (66.7%) | Workflow: 1/3 (33.3%)
```

Print this line after every 10 test cases, not after every single test.
