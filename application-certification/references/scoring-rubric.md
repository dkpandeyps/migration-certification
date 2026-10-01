# Scoring Rubric — Health Score Calculation and Defect Severity

---

## Health Score Formula

The health score is a 0–100 number for trend tracking. It uses equal weights across all coverage dimensions:

```
score = (page_pct + form_pct + field_pct + uiux_pct + workflow_pct + permission_pct + api_pct) / 7

Where each _pct = (covered + acknowledged) / total * 100
```

**Important:** The score is informational only. It is NOT used for the production-readiness verdict.
The verdict is always binary and gate-based (see `certification-criteria.md`).

### Score Interpretation (for human context only)

| Range | Label | What It Means |
|-------|-------|---------------|
| 95–100 | Excellent | Near-complete coverage, very few or no defects |
| 85–94 | Good | Good coverage, some gaps worth addressing before go-live |
| 70–84 | Acceptable | Moderate coverage; should not go live without closing gaps |
| 50–69 | Needs Work | Significant gaps; high risk if deployed |
| 0–49 | Poor | Major coverage failures; do not proceed |

---

## Defect Severity Definitions

### Critical (blocks go-live unconditionally)

| Category | Example |
|----------|---------|
| **Validation bypass** | Email field accepts `"notanemail"` — form submits successfully |
| **Authentication bypass** | Merchant role can access `/admin/system-settings` |
| **Authorization bypass** | Non-admin can call `DELETE /api/merchants/{id}` and get 200 |
| **Unhandled crash** | Page throws JavaScript exception; app shows blank screen or error boundary |
| **Data loss** | Delete without confirmation; overwrite without warning |
| **Incorrect calculation** | Settlement total is wrong; balance displayed incorrectly |
| **Data exposure** | One merchant can see another merchant's data |

### High (must be fixed before go-live; not a blocker if tracked)

| Category | Example |
|----------|---------|
| **Feature non-functional** | Create Merchant form always returns 500 Internal Server Error |
| **Data not persisted** | Edit form shows success but values revert on reload |
| **Required action missing** | Approve button not present for records in Pending state |
| **Workflow stuck** | Wizard step 2 cannot be reached — "Next" button unresponsive |

### High (must be fixed before go-live; not a blocker if tracked)

| Category | Example |
|----------|---------|
| **Feature non-functional** | Create Merchant form always returns 500 Internal Server Error |
| **Data not persisted** | Edit form shows success but values revert on reload |
| **Required action missing** | Approve button not present for records in Pending state |
| **Workflow stuck** | Wizard step 2 cannot be reached — "Next" button unresponsive |
| **Submit button stuck** | Form is fully and validly filled but Confirm/Save button stays disabled |
| **No field highlight on error** | After bad submit, no field turns red or shows aria-invalid — user cannot identify which field to fix |

### Medium (should be fixed; document as known issue if not)

| Category | Example |
|----------|---------|
| **Wrong error message** | Required field shows "Invalid format" instead of "Field is required" |
| **Validation wrong rules** | Max length is 50 but UI says max is 100 |
| **UI inconsistency** | Same action labeled "Edit" on one page and "Modify" on another |
| **Missing empty state** | Filter with no results shows blank screen instead of "No results found" |
| **Non-critical feature broken** | Export generates an empty CSV when data exists |
| **Toast-only error feedback** | Validation failure shown only as a dismissible toast — no inline message next to the field |
| **Missing required indicator** | Required field has no `*` or equivalent visual marker — users discover it is required only after submit fails |
| **Vague error message** | Error text is just "Error" or "Invalid" — does not name the field or the rule violated |

### Low (nice-to-fix; no production risk)

| Category | Example |
|----------|---------|
| **Typo** | "Businiess Name" instead of "Business Name" |
| **Alignment issue** | Button slightly off-center on mobile |
| **Missing tooltip** | Icon has no tooltip when hovered |
| **Cosmetic** | Spinner animation missing on one page but not others |
| **Placeholder-only label** | Field uses placeholder as its only label — label disappears when user starts typing |
| **Disabled field unclear** | Read-only field looks identical to editable field — no visual distinction |

---

## Auto-Severity Assignment Rules

When generating defects automatically, apply these rules:

```
# ── Field Validation Defects ────────────────────────────────────────────────
IF test_type = "negative_invalid_format" AND expected_outcome = "fail" AND actual_outcome = "pass":
  → severity = Critical (validation bypass)

IF test_type = "positive_valid" AND expected_outcome = "pass" AND actual_outcome = "fail":
  → severity = High (feature broken)

IF test_type = "negative_blank" AND expected_outcome = "fail" AND actual_outcome = "pass":
  → severity = Critical (required field accepts empty)

IF action = "permission" AND expected = "denied" AND actual = "allowed":
  → severity = Critical (authorization bypass)

IF action = "permission" AND expected = "allowed" AND actual = "denied":
  → severity = High (legitimate access denied)

IF test_type = "special_chars" AND expected_outcome = "fail" AND actual_outcome = "pass":
  → severity = Medium (input not sanitized — note: not a security pentest)

IF test_type = "boundary_over" AND expected_outcome = "fail" AND actual_outcome = "pass":
  → severity = Medium (boundary not enforced)

# ── UI/UX Defects (from field-testing-protocol.md and ui-ux-testing.md) ────
IF actual_outcome = "submit_button_stuck":
  → severity = High
  → title = "Submit button stays disabled after valid form fill"
  → include stuck_fields list in description

IF ui_ux.target_field_highlighted_on_error = false AND expected_outcome = "fail":
  → severity = High
  → title = "Field not highlighted on validation error"
  → description must include: field name, what error state was checked, what was found

IF ui_ux.only_toast_error = true AND ui_ux.inline_error_near_field = false:
  → severity = Medium
  → title = "Validation feedback is toast-only — no inline field error"

IF ui_ux.error_message_vague = true:
  → severity = Medium
  → title = "Error message too vague to guide user"

IF uiux_check = "required_indicator" AND hasRequiredMarker = false:
  → severity = Medium
  → title = "Required field has no visual marker"

IF uiux_check = "label_vs_placeholder" AND field in placeholderOnly:
  → severity = Low
  → title = "Field uses placeholder as its only label"

IF uiux_check = "empty_state" AND emptyMessageVisible = false:
  → severity = Medium
  → title = "No empty state message when list has zero results"

IF uiux_check = "disabled_clarity" AND isVisuallyDistinct = false:
  → severity = Low
  → title = "Read-only field indistinguishable from editable field"

ELSE:
  → severity = Medium (default — review manually for potential upgrade)
```

---

## Defect Deduplication

If the same field fails multiple test types (e.g., blank AND invalid format both bypass validation):
- Create ONE defect for the most severe test type
- Note the other failing test types in the defect's description
- Do not count duplicate failures as separate Critical defects

---

## Score Adjustment for Defects

The raw score from coverage percentages can be contextually adjusted for reporting:

```
raw_score = (page + form + field + uiux + workflow + permission + api) / 7
critical_penalty = critical_defects * 5   (each critical defect deducts 5 points)
high_penalty     = high_defects * 2

adjusted_score = max(0, raw_score - critical_penalty - high_penalty)
```

Report both `raw_score` and `adjusted_score` in `certification-result.json`.
The adjusted score is what appears in the executive summary.
