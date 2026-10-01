# Coverage Report

**Application:** {target_url}
**Role Tested:** {role}
**Generated:** {generated_at}
**Session ID:** {session_id}

---

## Coverage Dashboard

| Dimension | Total | Covered | Acknowledged | Not Covered | Coverage % | Gate Required | Gate Status |
|-----------|-------|---------|--------------|-------------|-----------|--------------|------------|
| Pages | {page_total} | {page_covered} | {page_ack} | {page_not_covered} | {page_pct}% | 100% | {page_gate} |
| Forms | {form_total} | {form_covered} | {form_ack} | {form_not_covered} | {form_pct}% | 100% | {form_gate} |
| Fields | {field_total} | {field_covered} | {field_ack} | {field_not_covered} | {field_pct}% | 100% | {field_gate} |
| UI/UX Checks | {uiux_total} | {uiux_covered} | {uiux_ack} | {uiux_not_covered} | {uiux_pct}% | 100% | {uiux_gate} |
| Workflows | {workflow_total} | {workflow_covered} | {workflow_ack} | {workflow_not_covered} | {workflow_pct}% | 100% | {workflow_gate} |
| Permissions | {permission_total} | {permission_covered} | {permission_ack} | {permission_not_covered} | {permission_pct}% | 100% | {permission_gate} |
| API Endpoints | {api_total} | {api_covered} | {api_ack} | {api_not_covered} | {api_pct}% | ≥80% | {api_gate} |

Gate: ✅ Passed | ❌ Failed

---

## What Was Covered

### Pages ({page_covered}/{page_total})
{IF page_covered > 0:}
{page_covered_list — format: "- /url — Page Title"}

### Forms ({form_covered}/{form_total})
{IF form_covered > 0:}
{form_covered_list — format: "- Form Name (Page: /url) — N fields tested"}

### UI/UX Checks ({uiux_covered}/{uiux_total})
{IF uiux_covered > 0:}
{uiux_covered_list — format: "- Form Name — N/9 checks passed (N not applicable)"}

### Workflows ({workflow_covered}/{workflow_total})
{IF workflow_covered > 0:}
{workflow_covered_list — format: "- Workflow Name — success path + N failure paths"}

---

## What Was NOT Covered

{IF all coverage = 100% and no gaps:}
✅ **No gaps.** All discovered items were covered during certification.

{ELSE:}

### Uncovered Pages
{IF page_not_covered > 0:}
| URL | Title | Reason |
|-----|-------|--------|
{uncovered_pages_rows}

{IF page_not_covered = 0:} *None — all pages covered.*

### Uncovered Forms
{IF form_not_covered > 0:}
| Form Name | Page | Trigger | Reason |
|-----------|------|---------|--------|
{uncovered_forms_rows}

{IF form_not_covered = 0:} *None — all forms covered.*

### Uncovered Fields
{IF field_not_covered > 0:}
| Field | Form | Type | Missing Test Types |
|-------|------|------|-------------------|
{uncovered_fields_rows}

{IF field_not_covered = 0:} *None — all fields covered.*

### Failed or Unrun UI/UX Checks
{IF uiux_not_covered > 0:}
| Form | Check | Observed | Defect |
|------|-------|----------|--------|
{uncovered_uiux_rows}

{IF uiux_not_covered = 0:} *None — every applicable UI/UX check passed.*

### Uncovered Workflows
{IF workflow_not_covered > 0:}
| Workflow | Type | Missing |
|---------|------|---------|
{uncovered_workflows_rows}

{IF workflow_not_covered = 0:} *None — all workflows covered.*

### Uncovered API Endpoints
{IF api_not_covered > 0:}
| Method | Path Pattern | Classification | Reason |
|--------|-------------|---------------|--------|
{uncovered_api_rows}

{IF api_not_covered = 0:} *None — all UI-triggered API endpoints covered.*

---

## Acknowledged Unreachable Items

{IF ack_count > 0:}

These items were waived from coverage with written justification. They are included in coverage percentage calculations as "covered" but represent residual risk.

| Item ID | Type | Name | Justification | Acknowledged At |
|---------|------|------|--------------|----------------|
{acknowledged_rows}

{IF ack_count = 0:} *No items were acknowledged as unreachable.*

---

## Coverage Assessment

{IF all gates pass:}
**All coverage gates passed.** The application has been fully exercised within the scope of what is reachable in this test environment.

{IF any gate fails:}
**Coverage is incomplete.** The following gates failed:

{failing_gates_list}

To achieve full coverage, the items listed in "What Was NOT Covered" must be tested.

---

*Coverage data: `{SESSION_DIR}/coverage/`*
*Acknowledged items: `{SESSION_DIR}/coverage/acknowledged-unreachable.json`*
