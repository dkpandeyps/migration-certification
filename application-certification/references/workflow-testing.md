# Workflow Testing — Discovery and Execution Protocol

This file is the instruction set for sub-agents testing individual workflows.
Each workflow was discovered during Phase 3 of `discover-app` and described in `inventory.json → workflows[]`.

---

## Workflow Types and How to Execute Them

### Type 1: Multi-Step Wizard

A wizard is a form broken into numbered steps with Next/Back navigation.

**Success Path Execution:**
```bash
# Step 1: Navigate to wizard start
$BROWSE goto "{workflow.trigger_page_url}"
$BROWSE click "text={wizard_trigger_button}"
$BROWSE wait --networkidle
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_step1_before.png"

# For each wizard step:
#   1. Fill all fields on this step with valid data
#   2. Screenshot
#   3. Click "Next" or "Continue"
#   4. Wait for next step to load
#   5. Verify step indicator advances

# Final step:
#   1. Fill final fields
#   2. Click "Submit" or "Finish"
$BROWSE wait --networkidle
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_success.png"

# Verify terminal state
FINAL_STATE=$($BROWSE js "document.querySelector('[class*=\"status\"],[class*=\"state\"]')?.textContent?.trim()")
# Verify FINAL_STATE matches one of workflow.terminal_states
```

**Failure Path Execution:**
```bash
# Start the wizard again
# At Step 1: intentionally leave a required field empty
# Click Next
# Verify: error shown, cannot advance
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_failure_step1.png"

# At Step 2: provide an invalid value in a key field
# Verify: appropriate error shown
```

---

### Type 2: Status Transition (Approve/Reject/Complete/etc.)

A status transition workflow changes a record from one state to another via a button click.

**Success Path Execution:**
```bash
# 1. Navigate to the list and find a record in the triggering state
#    (e.g., a Merchant with status "Pending")
$BROWSE goto "{workflow.trigger_page_url}?status=pending"  # or filter to pending
$BROWSE snapshot -i -a

# 2. Click the first available record's action button
$BROWSE click "@{transition_button_ref}"
$BROWSE wait --networkidle

# 3. Handle any confirmation dialog
CONFIRM=$($BROWSE js "document.querySelector('[role=\"dialog\"]') ? 'true' : 'false'")
if [ "$CONFIRM" = "true" ]; then
  $BROWSE click "text=Confirm" || $BROWSE click "text=Yes" || $BROWSE click "text=Approve"
  $BROWSE wait --networkidle
fi

$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_transition_success.png"

# 4. Verify status changed
NEW_STATUS=$($BROWSE js "
  (() => {
  // Re-fetch the record or check the updated row
  return document.querySelector('[data-record-id=\"{record_id}\"] [class*=\"status\"]')?.textContent?.trim()
})()")
# Verify NEW_STATUS matches expected terminal state
```

**Failure Path Execution:**
```bash
# Attempt the action on a record in the WRONG state (not eligible for this transition)
# e.g., try to "Approve" an already-approved merchant
# Verify: button is disabled OR error message shown
```

**Audit Log Verification (if applicable):**
```bash
# Navigate to the audit log or activity log section
$BROWSE goto "/audit-logs" || "/activity" || "/history"
# Look for the just-executed action in the log
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_audit_log.png"
# Verify: an entry for this action exists with correct timestamp and user
```

---

### Type 3: Confirmation Dialog Workflow

An action that requires a confirmation step before executing.

**Success Path:**
```bash
# Click the triggering action
$BROWSE click "@{trigger_ref}"
# Wait for dialog
$BROWSE wait "[role=dialog]"
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_confirm_dialog.png"
# Confirm
$BROWSE click "text=Confirm" || $BROWSE click "text=Yes"
$BROWSE wait --networkidle
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_confirmed.png"
# Verify: action executed successfully
```

**Failure Path (Cancel):**
```bash
# Click the triggering action
$BROWSE click "@{trigger_ref}"
$BROWSE wait "[role=dialog]"
# Cancel
$BROWSE click "text=Cancel" || $BROWSE click "text=No"
$BROWSE wait --networkidle
# Verify: action was NOT executed, record state unchanged
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_cancelled.png"
```

---

## Pre-Conditions and Data State

Some workflows require specific data to exist before they can be tested:

1. **Approval workflow:** Requires a record in "Pending" state
   - If none exists: run the Create action on the related module first to create a pending record
2. **Edit workflow:** Requires an existing record
   - If none exists: create one first
3. **Delete workflow:** Requires an existing record
   - Only applicable when `dry_run = false`

When creating pre-condition data, note it in the results as "setup" and not as a primary test.

---

## Notification Verification

If the workflow is expected to send notifications (email, SMS, in-app):

```bash
# In-app notifications:
$BROWSE js "
  (() => {
  const notifBadge = document.querySelector('.notification-badge, .badge, [class*=\"notif\"]');
  return notifBadge ? notifBadge.textContent.trim() : 'none';
})()"
$BROWSE screenshot "${TIMESTAMP}_wf_{wf_slug}_notification.png"
```

For email/SMS: note in results as "Email/SMS notification expected — cannot be automatically verified in browser. Manual verification recommended."

---

## Writing Workflow Results

```json
{
  "workflow_id": "workflow_001",
  "workflow_name": "Merchant Approval",
  "discovery_type": "status_transition",
  "success_path": {
    "executed": true,
    "terminal_state_reached": "Approved",
    "terminal_state_expected": "Approved",
    "passed": true,
    "evidence_screenshots": ["..."],
    "audit_log_verified": true
  },
  "failure_path": {
    "executed": true,
    "error_triggered": true,
    "error_handled_correctly": true,
    "passed": true,
    "evidence_screenshots": ["..."]
  },
  "notifications": {
    "in_app": {"verified": true, "screenshot": "..."},
    "email": {"verified": false, "note": "Cannot verify in browser"}
  },
  "pre_condition_setup": "Created test merchant record ID 9999 before testing",
  "overall_passed": true
}
```

Update `coverage-map.json`: mark this workflow as `covered`.
