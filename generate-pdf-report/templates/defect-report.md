# Defect Report

**Application:** {target_url}
**Role Tested:** {role}
**Generated:** {generated_at}
**Session ID:** {session_id}

---

## Summary

| Severity | Count | Blocks Go-Live |
|----------|-------|---------------|
| 🔴 Critical | {critical_count} | Yes — unconditionally |
| 🟠 High | {high_count} | Yes — if not tracked |
| 🟡 Medium | {medium_count} | No — document as known |
| 🔵 Low | {low_count} | No — post-launch backlog |
| **Total** | **{total_count}** | |

{IF total_count = 0:}

## ✅ No Defects Found

All test cases passed. No defects were identified during certification.

{ELSE:}

---

## Critical Defects

{IF critical_count = 0:} *No critical defects found.*

{FOR EACH critical defect:}

---

### {defect_id}: {title}

| Field | Value |
|-------|-------|
| **Severity** | 🔴 Critical |
| **Module** | {module} |
| **Page** | {page_url} |
| **Form** | {form_name} |
| **Field** | {field_name} |
| **Test Type** | {test_type} |
| **Discovered** | {discovered_at} |
| **Test ID** | {test_id} |

**Steps to Reproduce:**
{steps_numbered_list}

**Expected Result:**
> {expected_result}

**Actual Result:**
> ⚠️ {actual_result}

**Evidence:**
{screenshot_embeds}
*API log: `{api_log_path}`*

---

## High Defects

{IF high_count = 0:} *No high defects found.*

{FOR EACH high defect — same structure as critical}

---

## Medium Defects

{IF medium_count = 0:} *No medium defects found.*

{FOR EACH medium defect:}

---

### {defect_id}: {title}

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Module** | {module} |
| **Test Type** | {test_type} |

**Description:** {brief_description}

**Steps:** {steps_one_line_summary}

**Expected:** {expected_result}
**Actual:** {actual_result}

**Evidence:** {screenshot_path_link}

---

## Low Defects

{IF low_count = 0:} *No low defects found.*

{FOR EACH low defect — abbreviated format}

| ID | Title | Module | Test Type |
|----|-------|--------|-----------|
{low_defect_rows}

---

## Defect Distribution

By module:
{module_distribution_table}

By test type:
{test_type_distribution_table}

---

*Defect data source: `{SESSION_DIR}/defects/defects.json`*
*For Jira-ready format: `{SESSION_DIR}/defects/jira-bugs.json` and `jira-bugs.csv`*
