# Functional Testing Report

**Application:** {target_url}
**Role Tested:** {role}
**Test Period:** {started_at} → {completed_at}
**Session ID:** {session_id}

---

## Summary

| Category | Discovered | Tested | Tests Run | Passed | Failed | Coverage |
|----------|-----------|--------|-----------|--------|--------|---------|
| Forms | {form_total} | {forms_tested} | {form_tests_total} | {form_tests_passed} | {form_tests_failed} | {form_pct}% |
| CRUD Modules | {module_total} | {modules_tested} | {crud_tests_total} | {crud_tests_passed} | {crud_tests_failed} | {crud_pct}% |
| Workflows | {workflow_total} | {workflows_tested} | {workflow_tests_total} | {workflow_tests_passed} | {workflow_tests_failed} | {workflow_pct}% |
| **Total** | | | **{all_tests_total}** | **{all_tests_passed}** | **{all_tests_failed}** | |

---

## Form Testing Results

{FOR EACH tested form:}

### {form_name}

**Page:** {form_page_url} | **Fields:** {field_count} | **Tests:** {test_count} | **Coverage:** {coverage_pct}%

| Field | Type | Required | Tests Run | Passed | Failed | Issues |
|-------|------|----------|-----------|--------|--------|--------|
{field_rows}

**Failed Tests:**
{IF failed_tests exist:}
| Test ID | Test Type | Input Value | Expected | Actual | Severity |
|---------|-----------|------------|---------|--------|---------|
{failed_test_rows}

{IF no failed tests:} ✅ All field tests passed.

---

## CRUD Module Testing Results

{FOR EACH tested module:}

### {module_name}

**Page:** {page_url} | **Actions Discovered:** {action_count}

| Action | Status | Notes |
|--------|--------|-------|
| Create | {status_emoji} {status} | {notes} |
| View | {status_emoji} {status} | {notes} |
| Edit | {status_emoji} {status} | {notes} |
| Delete | {status_emoji} {status} | {notes} |
| Search | {status_emoji} {status} | {notes} |
| Filter | {status_emoji} {status} | {notes} |
| Export | {status_emoji} {status} | {notes} |
{additional_action_rows}

Status: ✅ Pass | ❌ Fail | ⏭️ Skipped (dry_run) | ➖ Not discovered

---

## Workflow Testing Results

{FOR EACH tested workflow:}

### {workflow_name}

**Type:** {discovery_type} | **Steps:** {step_count} | **Terminal States:** {terminal_states}

| Path | Executed | Outcome | Terminal State Reached | Audit Log |
|------|----------|---------|----------------------|-----------|
| Success Path | {executed} | {outcome_emoji} {outcome} | {terminal_state} | {audit_log_verified} |
| Failure Path | {executed} | {outcome_emoji} {outcome} | N/A | N/A |

**Notes:** {workflow_notes}

---

## Test Coverage Gaps

{IF any forms/modules/workflows were not tested:}

| Item | Type | Reason Not Tested |
|------|------|------------------|
{gap_rows}

{IF all items tested:}
*All discovered items were tested. No coverage gaps.*

---

## Evidence Index

All test evidence is stored in: `{SESSION_DIR}/evidence/`

- Screenshots: `evidence/screenshots/` — {screenshot_count} files
- API Logs: `evidence/api-logs/` — {api_log_count} files
- Console Logs: `evidence/console-logs/` — {console_log_count} files
