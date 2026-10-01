# CRUD Testing — Dynamic Module Action Discovery and Execution

This file is the instruction set for sub-agents testing CRUD modules (tables/lists).
Each sub-agent tests one table/module. No actions are hardcoded — all are discovered.

---

## Setup

```bash
MODULE_SLUG="{table_slug}"
TABLE_ID="{table.id}"
RESULTS_FILE="{SESSION_DIR}/test-results/crud-tests/$MODULE_SLUG-results.json"
INVENTORY_FILE="{SESSION_DIR}/discovery/inventory.json"

# Load table metadata from inventory
# (Read inventory.json, find the table with id = TABLE_ID)

# Login and navigate to the table's page
$BROWSE goto "{table.page_url}"
$BROWSE wait --networkidle
```

---

## Phase A — Discover Available Actions

Before running any tests, discover ALL available actions for this module dynamically.

### Discover Table-Level Actions (header buttons)
```bash
TOP_ACTIONS=$($BROWSE js "
  (() => {
  const buttons = [];
  // Look for action buttons above or near the table
  document.querySelectorAll('.table-actions button, .list-header button, .page-header button, [class*=\"toolbar\"] button').forEach(b => {
    if (b.offsetParent !== null)  // visible only
      buttons.push({label: b.textContent.trim(), type: 'table_action'});
  });
  return JSON.stringify(buttons);
})()")
```

### Discover Row-Level Actions
```bash
# Click the first data row's action area to reveal row actions
$BROWSE snapshot -i -a
ROW_ACTIONS=$($BROWSE js "
  (() => {
  const actions = [];
  // Look in the last column of the first data row (common pattern for action columns)
  const firstRow = document.querySelector('tbody tr:first-child, [role=\"row\"]:not([role=\"columnheader\"]):first-child');
  if (firstRow) {
    firstRow.querySelectorAll('button, a[role=\"button\"], [class*=\"action\"]').forEach(el => {
      if (el.offsetParent !== null)
        actions.push({label: el.textContent.trim(), type: 'row_action'});
    });
  }
  // Also check action dropdown menus
  const dropdownTriggers = firstRow && firstRow.querySelectorAll('[data-bs-toggle=\"dropdown\"], .dropdown-toggle');
  if (dropdownTriggers) {
    dropdownTriggers.forEach(trigger => {
      trigger.click();
      document.querySelectorAll('.dropdown-menu:not(.d-none) .dropdown-item').forEach(item => {
        actions.push({label: item.textContent.trim(), type: 'row_action_dropdown'});
      });
    });
  }
  return JSON.stringify(actions);
})()")
```

### Discover Bulk Actions
```bash
BULK_ACTIONS=$($BROWSE js "
  (() => {
  // Select a checkbox and look for bulk action controls
  const firstCheckbox = document.querySelector('tbody tr input[type=checkbox], tbody [role=row] input[type=checkbox]');
  if (firstCheckbox) {
    firstCheckbox.click();
    const actions = [...document.querySelectorAll('.bulk-actions button, [class*=\"bulk\"] button, [class*=\"selected\"] button')]
      .filter(b => b.offsetParent !== null)
      .map(b => ({label: b.textContent.trim(), type: 'bulk_action'}));
    firstCheckbox.click(); // deselect
    return JSON.stringify(actions);
  }
  return '[]';
})()")
```

Record all discovered actions in `results.discovered_actions[]`.

---

## Phase B — Map Actions to Test Types

For each discovered action label, classify it:

| Action Labels | Test Type |
|---------------|-----------|
| Add, Create, New, + | `create` |
| View, Details, Open, Eye icon | `view` |
| Edit, Update, Modify, Pencil icon | `edit` |
| Delete, Remove, Trash icon | `delete` |
| Search, Find | `search` |
| Filter | `filter` |
| Export, Download, CSV, Excel | `export` |
| Import, Upload | `import` |
| Approve, Accept | `approve` |
| Reject, Decline, Deny | `reject` |
| Clone, Copy, Duplicate | `clone` |
| Activate, Enable | `activate` |
| Deactivate, Disable, Suspend | `deactivate` |
| Any unmatched label | `custom_{label_slug}` |

---

## Phase C — Execute Tests Per Action Type

### CREATE Test
```bash
# 1. Click the Create/Add button
$BROWSE click "text={create_button_label}"
$BROWSE wait --networkidle

# 2. Screenshot the empty form — also capture initial submit button state
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_create_before.png"

SUBMIT_BTN_EMPTY=$($BROWSE js "
  (() => {
  const btn = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save], button[class*=add], button[class*=update]'
  )).find(b => b.offsetParent !== null);
  return btn ? JSON.stringify({text: btn.textContent.trim(), disabled: btn.disabled}) : 'NOT_FOUND';
})()")

# 3. Fill the create form with valid data
# Use the first field's positive_valid value from test-data/{create_form_slug}.json
# If no test data exists for this form, generate simple valid values on the fly
# Use React-compatible setter where needed (see shared/browse-integration.md)

# 3b. After filling ALL required fields, check submit button state
SUBMIT_BTN_FILLED=$($BROWSE js "
  (() => {
  const btn = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=confirm], button[class*=save], button[class*=add], button[class*=update]'
  )).find(b => b.offsetParent !== null);
  return btn ? JSON.stringify({text: btn.textContent.trim(), disabled: btn.disabled}) : 'NOT_FOUND';
})()")

# 3c. If button is STILL disabled after filling all required fields → stuck-form defect
if [[ "$SUBMIT_BTN_FILLED" contains '"disabled":true' ]]; then
  STUCK_FIELDS=$($BROWSE js "
    (() => {
    const problems = [];
    document.querySelectorAll('[aria-invalid=true]').forEach(f => {
      problems.push({field: f.name || f.id || f.placeholder, reason: 'aria-invalid'});
    });
    document.querySelectorAll('.is-invalid, input[class*=error]').forEach(f => {
      if (f.offsetParent !== null)
        problems.push({field: f.name || f.id || f.placeholder, reason: 'error-class'});
    });
    document.querySelectorAll('input[required]:not([type=hidden]), select[required], textarea[required]').forEach(f => {
      if (!f.value || f.value.trim() === '')
        problems.push({field: f.name || f.id || f.placeholder, reason: 'still-empty'});
    });
    return JSON.stringify(problems);
})()")
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_create_stuck.png"
  write_defect({
    severity: "High",
    title: "Create form: Submit button stays disabled after valid fill",
    description: "Filled all required fields with valid data. Submit/Confirm button remained disabled. Blocking fields: " + STUCK_FIELDS,
    evidence: ["..._create_stuck.png"]
  })
  # Record and continue — this counts as a failed CREATE test
  write_result("create", "submit_button_stuck", [...])
  continue
fi

# 4. Submit
$BROWSE click "button[type=submit]"
$BROWSE wait --networkidle

# 5. Verify: record appears in list
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_create_after.png"
CREATED_ID=$($BROWSE js "/* extract ID from success message or URL */")

# Record result
write_result("create", "passed/failed", screenshots, api_logs)
```

### VIEW Test
```bash
# Prerequisite: a record must exist (use the one created in CREATE test)
# Click the View/Details action on that record
$BROWSE click "@row_action_view_ref"
$BROWSE wait --networkidle
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_view.png"
# Verify: detail page loaded, fields are populated
```

### EDIT Test
```bash
# Navigate to or click Edit on the record created in CREATE
$BROWSE click "@row_action_edit_ref"
$BROWSE wait --networkidle
$BROWSE snapshot -i -a

# Change one field value
$BROWSE fill @first_editable_field "{new_valid_value}"

# Check submit button state after edit (same stuck-form check as CREATE)
EDIT_BTN_STATE=$($BROWSE js "
  (() => {
  const btn = Array.from(document.querySelectorAll(
    'button[type=submit], button[class*=submit], button[class*=save], button[class*=update]'
  )).find(b => b.offsetParent !== null);
  return btn ? JSON.stringify({text: btn.textContent.trim(), disabled: btn.disabled}) : 'NOT_FOUND';
})()")

if [[ "$EDIT_BTN_STATE" contains '"disabled":true' ]]; then
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_edit_stuck.png"
  STUCK_FIELDS=$($BROWSE js "
    (() => {
    const p = [];
    document.querySelectorAll('[aria-invalid=true]').forEach(f =>
      p.push({field: f.name || f.id, reason: 'aria-invalid'}));
    document.querySelectorAll('input[required]:not([type=hidden])').forEach(f => {
      if (!f.value || f.value.trim() === '')
        p.push({field: f.name || f.id, reason: 'still-empty'});
    });
    return JSON.stringify(p);
})()")
  write_defect({severity: "High", title: "Edit form: Submit button stays disabled after valid change", description: "...", stuck_fields: STUCK_FIELDS})
  write_result("edit", "submit_button_stuck", [...])
  continue
fi

$BROWSE click "button[type=submit]"
$BROWSE wait --networkidle

# Verify: success message, updated value visible
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_edit.png"
```

### DELETE Test
```bash
if [ "${dry_run:-false}" = "true" ]; then
  write_result("delete", "skipped_dry_run", [], [])
  continue
fi

# Click Delete on a test record (one created during this test run, not existing data)
$BROWSE click "@row_action_delete_ref"
# Handle confirmation dialog
CONFIRM_DIALOG=$($BROWSE snapshot -i)
if echo "$CONFIRM_DIALOG" | grep -qi "confirm\|sure\|yes"; then
  $BROWSE click "text=Confirm" || $BROWSE click "text=Yes" || $BROWSE click "text=Delete"
fi
$BROWSE wait --networkidle
$BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_delete.png"
# Verify: record no longer appears in list
```

### SEARCH Test
```bash
if [ -n "$has_search" ]; then
  # Search for the record created during CREATE test
  $BROWSE fill ".search-input, input[type=search], input[placeholder*='Search']" "{known_value}"
  $BROWSE press Enter
  $BROWSE wait --networkidle
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_search_found.png"
  # Verify: expected record appears

  # Search for non-existent value
  $BROWSE fill ".search-input" "ZZZZNOTFOUND99999"
  $BROWSE press Enter
  $BROWSE wait --networkidle
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_search_empty.png"
  # Verify: empty state message appears
fi
```

### FILTER Test
```bash
for FILTER_FIELD in {table.filter_fields}; do
  # Apply the filter
  # (each filter may be a dropdown, date range, or text input — detect from snapshot)
  $BROWSE snapshot -i -a
  # Click or fill the filter control
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_filter_{filter_field}.png"
  # Verify: results change
  # Reset filter before next
done
```

### EXPORT Test
```bash
if echo "$DISCOVERED_ACTIONS" | grep -qi "export"; then
  $BROWSE click "text={export_button_label}"
  $BROWSE wait --networkidle
  # Verify: download initiated (check for browser download dialog or network response with Content-Disposition)
  $BROWSE screenshot "$EVIDENCE_DIR/screenshots/${TIMESTAMP}_crud_{module}_export.png"
fi
```

### APPROVE / REJECT Test
```bash
if [ "${dry_run:-false}" = "true" ]; then
  write_result("approve", "skipped_dry_run", [], [])
else
  # Navigate to a pending record
  # Click Approve — verify status changes to Approved
  # Navigate to another pending record
  # Click Reject — verify status changes to Rejected
fi
```

### CLONE Test
```bash
# Click Clone on existing record
# Verify: a new record appears with same data but new ID
```

### ACTIVATE / DEACTIVATE Test
```bash
if [ "${dry_run:-false}" = "true" ]; then
  write_result("deactivate", "skipped_dry_run", [], [])
else
  # Click Deactivate — verify status changes
  # Click Activate — verify status restores
fi
```

### CUSTOM Actions
For any action that didn't match the known types:
1. Click the action button
2. Screenshot the result
3. Record as `custom_{label_slug}` with `passed = true` if no error appeared
4. Note: "Custom action — manual review recommended"

---

## Phase D — Write Results

```json
{
  "table_id": "table_001",
  "module_name": "Merchants List",
  "module_slug": "merchants_list",
  "discovered_actions": ["create", "view", "edit", "delete", "search", "filter", "export", "approve", "reject"],
  "test_results": [
    {
      "action": "create",
      "passed": true,
      "skipped": false,
      "skip_reason": null,
      "evidence_screenshots": ["..."],
      "api_log_path": "..."
    }
  ],
  "coverage_pct": 100.0,
  "notes": []
}
```

Update `coverage-map.json`: page coverage for the table's page.
