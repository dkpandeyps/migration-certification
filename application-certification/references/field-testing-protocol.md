# Field Testing Protocol — Sub-Agent Instructions for Form Testing

This file is the instruction set for sub-agents spawned by `/application-certification` Phase 3.
Each sub-agent receives this file and tests one complete form.

---

## Sub-Agent Setup

```bash
# Resolve paths
FORM_SLUG="{form.form_slug}"
TEST_DATA_FILE="{SESSION_DIR}/test-data/$FORM_SLUG.json"
RESULTS_FILE="{SESSION_DIR}/test-results/form-tests/$FORM_SLUG-results.json"
EVIDENCE_DIR="{SESSION_DIR}/evidence"

# Verify test data exists
if [ ! -f "$TEST_DATA_FILE" ]; then
  echo "ERROR: Test data not found: $TEST_DATA_FILE"
  exit 1
fi

# Resolve browse binary
# (see shared/browse-integration.md → Binary Location Resolution)

# Login
# (see shared/browse-integration.md → Login)

# Set up network interception
# (see shared/browse-integration.md → Network Interception Setup)
```

---

## Test Execution Loop

Read `TEST_DATA_FILE`. It contains `test_cases[]`. For each test case:

### Step 1 — Navigate to the Form

```bash
$BROWSE goto "{form.page_url or trigger URL}"
$BROWSE wait --networkidle
```

If the form is inside a dialog, click the trigger button first:
```bash
$BROWSE click "text={form.trigger_label}"
$BROWSE wait "[role=dialog]"
```

### Step 2 — Set Up Other Fields (valid values for non-target fields)

The test case contains `fill_instructions.other_fields` — fill these first to ensure the form is in a valid state for all fields except the target.

For each field in `other_fields`:
```bash
$BROWSE fill @{field_ref} "{value}"   # text/email/number/tel/url
$BROWSE select @{field_ref} "{value}" # select
$BROWSE click @{field_ref}            # checkbox: click toggles — only click if `$BROWSE is checked @{field_ref}` differs from the wanted value
```

### Step 2b — Record Submit Button State Before Fill

Capture the submit button's enabled/disabled state before filling the target field.
This establishes a baseline — if the button is already stuck disabled at this stage,
record it as a precondition rather than attributing it to the target field.

```bash
PRE_FILL_BUTTON=$($BROWSE js "
  (() => {
  const btn = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save], button[class*=add], button[class*=update]'
  )).find(b => b.offsetParent !== null);
  if (!btn) return JSON.stringify({found: false});
  return JSON.stringify({
    found: true,
    text: btn.textContent.trim(),
    disabled: btn.disabled,
    disabledAttr: btn.hasAttribute('disabled'),
    disabledClass: /disabled|inactive/i.test(btn.className)
  });
})()")
```

### Step 3 — Screenshot Before

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{test_id}_before.png"
```

### Step 4 — Set the Target Field

Apply the test case's `fill_instructions.target_field` and `value`:
```bash
$BROWSE fill @{target_field_ref} "{value}"
```

For special cases:
- **Empty string (negative_blank):** `$BROWSE fill @ref ""` then `$BROWSE press Tab`
- **Select invalid value:** `$BROWSE js "document.querySelector('[name={field_name}]').value = '{invalid_value}'"`
- **Null injection:** `$BROWSE js "document.querySelector('[name={field_name}]').value = null"`

### Step 5 — Submit the Form

Before clicking submit, check whether the button is currently enabled:

```bash
POST_FILL_BUTTON=$($BROWSE js "
  (() => {
  const btn = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save], button[class*=add], button[class*=update]'
  )).find(b => b.offsetParent !== null);
  if (!btn) return JSON.stringify({found: false});
  return JSON.stringify({
    found: true,
    text: btn.textContent.trim(),
    disabled: btn.disabled,
    disabledAttr: btn.hasAttribute('disabled'),
    disabledClass: /disabled|inactive/i.test(btn.className)
  });
})()")
```

**If button is disabled after filling all required fields for a `positive_valid` test:**
- DO NOT attempt to click it (the click will do nothing)
- Run the stuck-form diagnosis:
  ```bash
  STUCK_FIELDS=$($BROWSE js "
    (() => {
    const problems = [];
    // Fields still aria-invalid
    document.querySelectorAll('[aria-invalid=true]').forEach(f => {
      problems.push({field: f.name || f.id || f.placeholder, reason: 'aria-invalid=true'});
    });
    // Fields with visible error state
    document.querySelectorAll('.is-invalid, [class*=error] input, input[class*=error]').forEach(f => {
      if (f.offsetParent !== null)
        problems.push({field: f.name || f.id || f.placeholder, reason: 'error-class-present'});
    });
    // Required fields still empty
    document.querySelectorAll('input[required]:not([type=hidden]), select[required], textarea[required]').forEach(f => {
      if (!f.value || f.value.trim() === '')
        problems.push({field: f.name || f.id || f.placeholder, reason: 'required_still_empty'});
    });
    return JSON.stringify(problems);
})()")
  ```
- Record as `actual_outcome = "submit_button_stuck"`, severity = **High**
- Screenshot and record which fields are blocking in `stuck_fields` array
- This is a separate defect from the field validation result

If the button IS enabled, proceed normally:
```bash
$BROWSE click "button[type=submit]"   # or click the submit button ref from snapshot
$BROWSE wait --networkidle
```

### Step 6 — Screenshot After

```bash
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{test_id}_after.png"
```

### Step 7 — Read API Logs

```bash
API_LOGS=$($BROWSE js "JSON.stringify(window.__apiLogs)")
$BROWSE js "window.__apiLogs = []"
echo "$API_LOGS" > "$EVIDENCE_DIR/api-logs/${test_id}.json"
```

### Step 8 — Assert Outcome

**For `expected_outcome = "pass"` tests:**
- Check the page does NOT show a validation error for the target field
- Check the page shows a success indicator (success message, redirect, record created)
- If success NOT detected: mark `passed = false`, `actual_outcome = "unexpected_failure"`

**For `expected_outcome = "fail"` tests:**
- Check the page DOES show a validation error
- If `expected_error_contains` is set: verify the error message contains at least one of the expected strings (case-insensitive)
- If error NOT shown: mark `passed = false`, `actual_outcome = "validation_bypass"`, severity = Critical

**Error detection approach:**
```bash
HAS_ERROR=$($BROWSE js "
  (() => {
  const errorSelectors = [
    '[class*=\"error\"]', '[class*=\"invalid\"]', '[class*=\"danger\"]',
    '[role=\"alert\"]', '.field-error', '.help-block', '[aria-invalid=\"true\"]',
    '.error-message', '.validation-error', '.is-invalid ~ .invalid-feedback'
  ];
  for (const sel of errorSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      if (el.textContent.trim() && el.offsetParent !== null) return 'true';
    }
  }
  return 'false';
})()")
```

**Additional UI/UX error checks (run on ALL `expected_outcome = "fail"` tests):**

After confirming an error exists, also capture:

```bash
ERROR_UI_DETAIL=$($BROWSE js "
  (() => {
  const result = {
    targetFieldHighlighted: false,
    inlineErrorNearField: false,
    errorTextContent: '',
    onlyToastError: false,
    errorIsVague: false
  };

  // 1. Is the target field itself highlighted?
  const targetFieldName = '{target_field.name}';
  const targetField = document.querySelector('[name=\"' + targetFieldName + '\"]') ||
                      document.querySelector('#' + targetFieldName);
  if (targetField) {
    result.targetFieldHighlighted =
      targetField.getAttribute('aria-invalid') === 'true' ||
      targetField.classList.toString().includes('error') ||
      targetField.classList.toString().includes('invalid') ||
      targetField.classList.toString().includes('is-invalid') ||
      window.getComputedStyle(targetField).borderColor.includes('255, 0') ||  // red border
      window.getComputedStyle(targetField).borderColor.includes('220, 53');   // Bootstrap danger
  }

  // 2. Is there an inline error message near the field (not just a toast)?
  const parent = targetField?.closest('[class*=form-group],[class*=field],[class*=control],div');
  if (parent) {
    const inlineErr = parent.querySelector(
      '[class*=error],[class*=invalid],[class*=feedback],[role=alert]'
    );
    if (inlineErr && inlineErr.textContent.trim() && inlineErr.offsetParent !== null) {
      result.inlineErrorNearField = true;
      result.errorTextContent = inlineErr.textContent.trim();
    }
  }

  // 3. Is there ONLY a toast/global error (no inline)?
  const toastErrors = document.querySelectorAll('[class*=toast],[class*=snackbar],[class*=notification]');
  const hasToast = Array.from(toastErrors).some(t => t.textContent.trim() && t.offsetParent !== null);
  if (hasToast && !result.inlineErrorNearField && !result.targetFieldHighlighted) {
    result.onlyToastError = true;
  }

  // 4. Is the error message too vague?
  if (result.errorTextContent) {
    result.errorIsVague = /^(error|invalid|required|fail|bad|wrong)\.?$/i.test(
      result.errorTextContent.trim()
    ) || result.errorTextContent.trim().length < 8;
  }

  return JSON.stringify(result);
})()")
```

Record `ERROR_UI_DETAIL` in the test result. Generate additional defects for:
- `targetFieldHighlighted = false` → **High** defect: "Field not highlighted on validation error — user cannot tell which field failed"
- `inlineErrorNearField = false` AND `onlyToastError = true` → **Medium** defect: "Only toast error shown — no inline field-level feedback"
- `errorIsVague = true` → **Medium** defect: "Error message is too vague to guide correction"

### Step 9 — Take Error Screenshot (if unexpected outcome)

```bash
if [ "$TEST_PASSED" = "false" ]; then
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_{test_id}_error.png"
fi
```

### Step 10 — Write Result Record

Append to `RESULTS_FILE`:
```json
{
  "test_id": "{test_id}",
  "form_id": "{form.id}",
  "field_id": "{field.id}",
  "field_name": "{field.field_name}",
  "test_type": "{test_case.test_type}",
  "input_value": "{value}",
  "expected_outcome": "pass|fail",
  "actual_outcome": "pass|fail|unexpected_failure|validation_bypass|submit_button_stuck|error",
  "passed": true,
  "error_message_shown": "...",
  "ui_ux": {
    "submit_button_disabled_before_fill": false,
    "submit_button_disabled_after_fill": false,
    "stuck_fields": [],
    "target_field_highlighted_on_error": true,
    "inline_error_near_field": true,
    "only_toast_error": false,
    "error_message_text": "...",
    "error_message_vague": false
  },
  "evidence_screenshots": ["path1.png", "path2.png"],
  "api_log_path": "...",
  "tested_at": "ISO timestamp"
}
```

### Step 11 — Wait Between Tests

```bash
sleep $(echo "scale=3; {test_delay_ms} / 1000" | bc)
```

### Step 12 — Session Health Check (every 20 tests)

```bash
if [ $((TEST_COUNT % 20)) -eq 0 ]; then
  CURRENT_URL=$($BROWSE js "window.location.href")
  if echo "$CURRENT_URL" | grep -qi "login\|signin"; then
    echo "Session expired — re-logging in"
    # Re-run login sequence
  fi
fi
```

---

## Rate Limit Handling

After any 429 response detected in API logs:
```bash
echo "Rate limited. Backing off..."
RETRY_COUNT=$((RETRY_COUNT + 1))
sleep $((2 ** RETRY_COUNT * 2))   # 2s, 4s, 8s, 16s, 32s
if [ $RETRY_COUNT -gt 5 ]; then
  mark_test_as "infrastructure_blocked"
  continue
fi
```

---

## Dry Run Mode

When `dry_run = true`, skip any test that exercises a DESTRUCTIVE form action (forms whose `form_action` contains `delete`, `remove`, `destroy`, or uses HTTP `DELETE` method).

Mark skipped tests as `"status": "skipped_dry_run"` in results.

---

## Form Results Summary

After all tests for this form, write a summary line to stdout:
```
Form 'Create Merchant': 82/87 tests passed (5 failed — 2 critical, 1 high, 2 medium)
```

And write final status to results file:
```json
{
  "form_id": "form_001",
  "form_name": "Create Merchant",
  "total_tests": 87,
  "passed": 82,
  "failed": 5,
  "skipped": 0,
  "coverage_pct": 100.0,
  "defect_severity_breakdown": {"critical": 2, "high": 1, "medium": 2, "low": 0},
  "test_cases": [...]
}
```

Update `coverage-map.json`: mark all fields as `covered` (or `skipped_dry_run`).
