# UI/UX Testing Protocol — Sub-Agent Instructions

This file is the instruction set for sub-agents spawned by `/application-certification` Phase 3b.
Each sub-agent tests one form or page for UI/UX quality: field highlighting, error proximity,
submit-button state, required-field indicators, empty states, and accessibility basics.

These checks catch issues that functional tests miss: the form *accepts* the right data, but the
UI does not *communicate* what went wrong to the user.

---

## What This Phase Covers

| Check | What We Look For |
|-------|-----------------|
| **Required field indicators** | Every required field has a visible `*` or equivalent marker |
| **Submit button state** | Button is disabled on empty form; enables only when all required fields are valid |
| **Stuck-form diagnosis** | When button stays disabled after valid fill, identify the blocking field |
| **Field highlight on error** | After a bad submit, the offending fields get a visual error state (red border, `aria-invalid`) |
| **Error message proximity** | Error messages appear inline next to their field, not only in a generic toast |
| **Error message content** | Error text names the field and the rule violated — not just "Error" or "Invalid" |
| **Placeholder / label presence** | Every field has a visible label (not placeholder-only) |
| **Empty state message** | Lists/tables show a human-readable message when no results found |
| **Loading state** | Async operations show a spinner or progress indicator |
| **Disabled-field clarity** | Read-only fields are visually distinct from editable fields |

---

## Setup

```bash
FORM_SLUG="{form.form_slug}"
RESULTS_FILE="{SESSION_DIR}/test-results/ui-ux-tests/$FORM_SLUG-uiux-results.json"
EVIDENCE_DIR="{SESSION_DIR}/evidence"

# Login and navigate to the page containing this form
$BROWSE goto "{form.page_url}"
$BROWSE wait --networkidle

# Open the form if it's in a dialog
# (click the trigger button, wait for [role=dialog])
```

---

## Check 1 — Required Field Indicators

**Goal:** Every required field must have a visual marker so users know what is mandatory
before they start filling out the form.

```bash
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{form_slug}_uiux_01_blank_form.png"

REQUIRED_CHECK=$($BROWSE js "
  (() => {
  const results = [];
  document.querySelectorAll('input, select, textarea').forEach(field => {
    if (field.required || field.getAttribute('aria-required') === 'true') {
      const label = document.querySelector('label[for=\"' + field.id + '\"]') ||
                    field.closest('label') ||
                    field.closest('[class*=form-group],[class*=field],[class*=control]')?.querySelector('label');
      const labelText = label ? label.textContent.trim() : '';
      const hasAsterisk = labelText.includes('*') || label?.innerHTML?.includes('*');
      const hasRequiredClass = field.closest('[class*=required]') !== null;
      results.push({
        field: field.name || field.id || field.placeholder,
        hasLabel: !!label,
        labelText: labelText,
        hasRequiredMarker: hasAsterisk || hasRequiredClass
      });
    }
  });
  return JSON.stringify(results);
})()")
```

**Assert:** Every required field where `hasRequiredMarker = false` is a defect.
Severity: **Medium** (users cannot tell what is required without trial and error).

---

## Check 2 — Submit Button Initial State

**Goal:** The submit/confirm button should be disabled on a completely blank form
(or enabled but immediately show errors on attempt — either pattern is acceptable,
but the button must NOT silently do nothing when the form is incomplete).

```bash
BLANK_BUTTON_STATE=$($BROWSE js "
  (() => {
  const submitBtns = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save]'
  )).filter(b => b.offsetParent !== null);
  return JSON.stringify(submitBtns.map(b => ({
    text: b.textContent.trim(),
    disabled: b.disabled,
    hasDisabledClass: b.classList.toString().toLowerCase().includes('disabled'),
    ariaDisabled: b.getAttribute('aria-disabled')
  })));
})()")
```

Record the initial button state. If it is enabled on blank form, note this — it is
acceptable IF the form shows field-level errors on submit attempt.

---

## Check 3 — Submit Button Enables on Valid Fill

**Goal:** Fill every required field with a valid value and confirm the submit button
becomes enabled (or remains enabled).

```bash
# Fill all required fields with their positive_valid values from test-data/{form_slug}.json
# (use the same React-compatible setter pattern from shared/browse-integration.md)

# After filling each field, re-check button state
FILL_PROGRESS=()
for each required field in inventory:
  fill the field with its positive_valid value
  
  BUTTON_STATE=$($BROWSE js "
    (() => {
    const btn = Array.from(document.querySelectorAll(
      'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save]'
    )).find(b => b.offsetParent !== null);
    return btn ? JSON.stringify({
      text: btn.textContent.trim(),
      disabled: btn.disabled,
      disabledClass: btn.classList.toString().toLowerCase().includes('disabled')
    }) : 'NO_SUBMIT_BUTTON';
})()")
  FILL_PROGRESS.push({field: field_name, button_state: BUTTON_STATE})
done

$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{form_slug}_uiux_03_all_filled.png"

FINAL_BUTTON_STATE=$($BROWSE js "
  (() => {
  const btn = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save]'
  )).find(b => b.offsetParent !== null);
  return btn ? JSON.stringify({disabled: btn.disabled, text: btn.textContent.trim()}) : 'NOT_FOUND';
})()")
```

**Assert:** If `FINAL_BUTTON_STATE.disabled = true` after all required fields are validly filled:
→ This is a **High** severity defect: "Submit button stays disabled after complete valid fill".

---

## Check 4 — Stuck Form Diagnosis

**When:** Check 3 found the button is still disabled after filling all required fields.

**Goal:** Identify exactly which field(s) are preventing submission so the defect report
names the specific field, not just "form is broken."

```bash
STUCK_DIAGNOSIS=$($BROWSE js "
  (() => {
  const problems = [];
  
  // Check for fields with aria-invalid
  document.querySelectorAll('[aria-invalid=true]').forEach(f => {
    problems.push({field: f.name || f.id || f.placeholder, reason: 'aria-invalid=true'});
  });
  
  // Check for visible error messages
  const errorSelectors = [
    '[class*=error]', '[class*=invalid]', '[class*=danger]',
    '[role=alert]', '.field-error', '.help-block', '.invalid-feedback'
  ];
  errorSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.textContent.trim() && el.offsetParent !== null) {
        // Find the associated field
        const field = el.closest('[class*=form-group],[class*=field],[class*=control]')?.querySelector('input,select,textarea');
        problems.push({
          field: field ? (field.name || field.id || field.placeholder) : 'unknown',
          errorText: el.textContent.trim(),
          reason: 'visible_error_message'
        });
      }
    });
  });
  
  // Check for empty required fields
  document.querySelectorAll('input[required], select[required], textarea[required]').forEach(f => {
    if (!f.value || f.value.trim() === '') {
      problems.push({field: f.name || f.id || f.placeholder, reason: 'required_field_empty'});
    }
  });
  
  return JSON.stringify({problems, total: problems.length});
})()")
```

Write the diagnosis to the defect record. The defect description must include:
- The list of blocking fields with their `reason`
- A screenshot showing the current form state
- Recommendation: "The form must visually highlight blocking fields so users know what to fix."

---

## Check 5 — Field Highlight After Bad Submit

**Goal:** After submitting with invalid/missing data, the UI must visually mark
the offending fields — not just show a generic top-of-form error.

```bash
# Clear the form (or open fresh)
# Click submit WITHOUT filling required fields

$BROWSE click "button[type=submit]" || $BROWSE js "
  Array.from(document.querySelectorAll('button')).find(b =>
    /submit|save|confirm|add|create|update/i.test(b.textContent)
  )?.click()
"
sleep 1

$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{form_slug}_uiux_05_submit_empty.png"

HIGHLIGHT_CHECK=$($BROWSE js "
  (() => {
  const results = {
    fieldsHighlighted: 0,
    fieldDetails: [],
    hasGenericToastOnly: false,
    inlineErrorsPresent: false
  };
  
  // Count fields with visual error state
  const errorFieldSelectors = [
    'input[aria-invalid=true]', 'select[aria-invalid=true]', 'textarea[aria-invalid=true]',
    'input.is-invalid', 'input.error', 'input.invalid',
    'input[class*=error]', 'input[class*=invalid]',
    '.form-control.is-invalid'
  ];
  errorFieldSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(f => {
      if (f.offsetParent !== null) {
        results.fieldsHighlighted++;
        results.fieldDetails.push({
          field: f.name || f.id || f.placeholder,
          selector: sel
        });
      }
    });
  });
  
  // Check for inline error messages (next to fields, not just toast)
  const inlineErrors = document.querySelectorAll(
    '.invalid-feedback, .field-error, [class*=field-error], [class*=form-error]:not([class*=toast])'
  );
  inlineErrors.forEach(e => {
    if (e.textContent.trim() && e.offsetParent !== null) results.inlineErrorsPresent = true;
  });
  
  // Check if ONLY toast/snackbar error (no inline)
  const toastErrors = document.querySelectorAll(
    '[class*=toast], [class*=snackbar], [role=alert][class*=notification]'
  );
  if (toastErrors.length > 0 && !results.inlineErrorsPresent && results.fieldsHighlighted === 0) {
    results.hasGenericToastOnly = true;
  }
  
  return JSON.stringify(results);
})()")
```

**Assert:**
- `fieldsHighlighted = 0` AND `inlineErrorsPresent = false` → **High** defect:
  "No field highlighting on validation failure — users cannot identify which field to fix"
- `hasGenericToastOnly = true` → **Medium** defect:
  "Only a generic toast error shown — no inline field-level feedback"
- `inlineErrorsPresent = true` AND `fieldsHighlighted > 0` → ✅ Pass

---

## Check 6 — Error Message Content Quality

**Goal:** Error messages must name the field and state the rule — not just say "Error" or "Invalid."

```bash
ERROR_CONTENT_CHECK=$($BROWSE js "
  (() => {
  const errors = [];
  const errorSelectors = [
    '.invalid-feedback', '.field-error', '[class*=field-error]',
    '[class*=error-message]', '[class*=validation-message]',
    '[aria-invalid=true] + *', '[aria-invalid=true] ~ [class*=error]'
  ];
  errorSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const text = el.textContent.trim();
      if (text && el.offsetParent !== null) {
        errors.push({
          text: text,
          isVague: /^(error|invalid|required|fail|bad)\.?$/i.test(text),
          isTooShort: text.length < 8,
          hasFieldName: true  // override manually if needed
        });
      }
    });
  });
  return JSON.stringify(errors);
})()")
```

**Assert:** Any error where `isVague = true` or `isTooShort = true` is a **Medium** defect:
"Error message is too vague to guide the user — must state the field name and the rule violated."

---

## Check 7 — Label vs Placeholder-Only

**Goal:** Fields that use only `placeholder` text as their label provide no label when
the user starts typing — the field purpose becomes invisible. This is an accessibility
and UX failure.

```bash
LABEL_CHECK=$($BROWSE js "
  (() => {
  const placeholderOnly = [];
  document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea').forEach(f => {
    if (f.offsetParent === null) return;
    const hasExplicitLabel = !!document.querySelector('label[for=\"' + f.id + '\"]');
    const hasWrappingLabel = !!f.closest('label');
    const hasAriaLabel = !!f.getAttribute('aria-label') || !!f.getAttribute('aria-labelledby');
    const hasPlaceholder = !!f.placeholder;
    if (!hasExplicitLabel && !hasWrappingLabel && !hasAriaLabel && hasPlaceholder) {
      placeholderOnly.push({field: f.name || f.id, placeholder: f.placeholder});
    }
  });
  return JSON.stringify(placeholderOnly);
})()")
```

**Assert:** Any `placeholderOnly` field is a **Low** defect (Medium if the form has many fields
where users lose context).

---

## Check 8 — Empty State Messages

**Goal:** Lists and tables must show a human-readable message when filtered to zero results,
not a blank screen.

```bash
# On the list/table page (not inside a dialog):
# If this form is for a list page, trigger the empty state:
$BROWSE fill "input[placeholder*='Search']" "ZZZZZ_NOTFOUND_UIUX_TEST_99999"
$BROWSE press Enter
$BROWSE wait --networkidle
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{form_slug}_uiux_08_empty_state.png"

EMPTY_STATE_CHECK=$($BROWSE js "
  (() => {
  const tbody = document.querySelector('tbody');
  const rows = tbody ? tbody.querySelectorAll('tr') : [];
  const emptyMessages = Array.from(document.querySelectorAll(
    '[class*=empty], [class*=no-data], [class*=no-result], [class*=not-found]'
  )).filter(el => el.offsetParent !== null && el.textContent.trim().length > 3);
  
  return JSON.stringify({
    rowCount: rows.length,
    emptyMessageVisible: emptyMessages.length > 0,
    emptyMessageText: emptyMessages[0]?.textContent.trim() || ''
  });
})()")
```

**Assert:** If `rowCount = 0` AND `emptyMessageVisible = false` → **Medium** defect:
"No empty state message — blank screen when search returns zero results."

---

## Check 9 — Disabled Field Clarity

**Goal:** View-only or locked fields must look visually different from editable fields
(gray background, lock icon, or explicit "read-only" label). Users filling the form
must not confuse read-only fields for editable ones.

```bash
DISABLED_CHECK=$($BROWSE js "
  (() => {
  const readonlyFields = [];
  document.querySelectorAll('input[disabled], input[readonly], select[disabled]').forEach(f => {
    if (f.offsetParent === null) return;
    const styles = window.getComputedStyle(f);
    const bgColor = styles.backgroundColor;
    const cursor = styles.cursor;
    const isVisuallyDistinct =
      bgColor !== 'rgb(255, 255, 255)' &&  // not plain white
      bgColor !== 'rgba(0, 0, 0, 0)' &&    // not transparent
      cursor !== 'text';
    readonlyFields.push({
      field: f.name || f.id || f.placeholder,
      disabled: f.disabled,
      readonly: f.readOnly,
      bgColor: bgColor,
      cursor: cursor,
      isVisuallyDistinct: isVisuallyDistinct
    });
  });
  return JSON.stringify(readonlyFields);
})()")
```

**Assert:** Any field where `disabled/readonly = true` AND `isVisuallyDistinct = false` →
**Low** defect: "Disabled field is not visually distinct from editable fields."

---

## Write Results

After all 9 checks, write:

```json
{
  "form_id": "{form.id}",
  "form_slug": "{form_slug}",
  "tested_at": "ISO timestamp",
  "checks": {
    "required_indicators": { "passed": true, "defects": [] },
    "submit_button_initial": { "passed": true, "initial_disabled": true },
    "submit_button_after_fill": { "passed": true, "enabled_after_fill": true },
    "stuck_form_diagnosis": { "passed": true, "blocking_fields": [] },
    "field_highlight_on_error": { "passed": false, "defect_severity": "High", "fields_highlighted": 0 },
    "error_message_content": { "passed": true, "vague_errors": [] },
    "label_vs_placeholder": { "passed": true, "placeholder_only_fields": [] },
    "empty_state": { "passed": true, "empty_message_visible": true },
    "disabled_clarity": { "passed": true, "unclear_disabled_fields": [] }
  },
  "total_checks": 9,
  "passed_checks": 8,
  "defects_found": [
    {
      "check_id": "field_highlight_on_error",
      "severity": "High",
      "title": "No field highlighting on validation failure",
      "description": "...",
      "evidence_screenshot": "...",
      "recommendation": "Add CSS class or aria-invalid=true to fields with errors on submit attempt"
    }
  ],
  "evidence_screenshots": ["..."]
}
```

If a check has nothing on the form to inspect (e.g. `empty_state` on a form with no list, `disabled_clarity`
with no disabled fields), record it as `{ "passed": null, "applicable": false, "reason": "..." }` and lower
`total_checks` by one. A check that ran and failed is never marked not applicable. Coverage and GATE_UIUX_COV
use `passed_checks / total_checks` (see `shared/coverage-tracker.md`).

Output summary line:
```
UI/UX 'Create Bank' form: 8/9 checks passed — 1 High defect: No field highlighting on validation failure
```
