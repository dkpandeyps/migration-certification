# Traceability Matrix — Legacy to New System Mapping

The traceability matrix provides an auditable record of every legacy feature and where it lives (or doesn't) in the new system.

---

## Matrix Construction Algorithm

### Page Traceability

```
FOR EACH old_page IN old_inventory.pages:
  match = find matching new_page (from inventory-diff.json)
  
  row = {
    old_page_id:    old_page.id,
    old_url:        old_page.url,
    old_title:      old_page.title,
    new_page_id:    match ? match.id : null,
    new_url:        match ? match.url : null,
    new_title:      match ? match.title : null,
    status:         match ? (inventory_diff says "equivalent"|"moved"|"changed") : "missing",
    gap_ids:        [gap IDs that affect this page],
    cert_old:       old_certification_result for this page (pass/fail),
    cert_new:       new_certification_result for this page (pass/fail)
  }
```

### Form Traceability

```
FOR EACH old_form IN old_inventory.forms:
  match = find matching new_form
  
  row = {
    old_form_id:      old_form.id,
    old_form_name:    old_form.form_name,
    old_field_count:  len(old_form.fields),
    new_form_id:      match ? match.id : null,
    new_form_name:    match ? match.form_name : null,
    new_field_count:  match ? len(match.fields) : 0,
    removed_fields:   fields in old but not new,
    added_fields:     fields in new but not old,
    changed_fields:   fields with different type/rules,
    status:           "equivalent" | "changed" | "missing",
    gap_ids:          [gap IDs for this form]
  }
```

### Workflow Traceability

```
FOR EACH old_workflow IN old_inventory.workflows:
  match = find matching new_workflow
  
  row = {
    old_workflow_id:    old_workflow.id,
    old_workflow_name:  old_workflow.name,
    new_workflow_id:    match ? match.id : null,
    status:             "equivalent" | "changed" | "missing",
    step_count_old:     len(old_workflow.steps),
    step_count_new:     match ? len(match.steps) : 0,
    gap_ids:            [...]
  }
```

---

## traceability-matrix.json

```json
{
  "session_id": "...",
  "generated_at": "2026-06-11T18:30:00Z",
  "old_url": "https://legacy.example.com",
  "new_url": "https://new.example.com",

  "page_traceability": [
    {
      "old_page_id": "page_001",
      "old_url": "/dashboard",
      "old_title": "Dashboard",
      "new_page_id": "page_001",
      "new_url": "/dashboard",
      "new_title": "Dashboard",
      "status": "equivalent",
      "gap_ids": [],
      "cert_old": "pass",
      "cert_new": "pass"
    },
    {
      "old_page_id": "page_009",
      "old_url": "/bulk-import",
      "old_title": "Bulk Import",
      "new_page_id": null,
      "new_url": null,
      "new_title": null,
      "status": "missing",
      "gap_ids": ["GAP_001"],
      "cert_old": "pass",
      "cert_new": null
    }
  ],

  "form_traceability": [...],
  "workflow_traceability": [...],

  "summary": {
    "pages_equivalent": 10,
    "pages_moved": 1,
    "pages_missing": 1,
    "pages_new": 2,
    "forms_equivalent": 6,
    "forms_changed": 1,
    "forms_missing": 1,
    "workflows_equivalent": 3,
    "workflows_missing": 0
  }
}
```

---

## traceability-matrix.md (for PDF rendering)

Write a markdown file with tables for each section:

```markdown
# Traceability Matrix
**Legacy:** https://legacy.example.com → **New:** https://new.example.com
Generated: 2026-06-11

## Page Traceability

| Legacy URL | Legacy Title | New URL | New Title | Status | Gaps | Old Cert | New Cert |
|-----------|-------------|---------|-----------|--------|------|----------|---------|
| /dashboard | Dashboard | /dashboard | Dashboard | ✅ Equivalent | — | ✅ Pass | ✅ Pass |
| /bulk-import | Bulk Import | — | — | ❌ Missing | GAP_001 | ✅ Pass | — |
| /merchants | Merchants | /merchants | Merchants | ✅ Equivalent | — | ✅ Pass | ✅ Pass |

## Form Traceability

| Legacy Form | Fields | New Form | Fields | Removed | Added | Changed | Status | Gaps |
|------------|--------|---------|--------|---------|-------|---------|--------|------|
| Create Merchant | 8 | Create Merchant | 8 | — | — | email.max_length | ⚠️ Changed | — |
| Bulk Import | 3 | — | — | 3 | — | — | ❌ Missing | GAP_001 |

## Workflow Traceability

| Legacy Workflow | Steps | New Workflow | Steps | Status | Gaps |
|----------------|-------|-------------|-------|--------|------|
| Merchant Approval | 3 | Merchant Approval | 3 | ✅ Equivalent | — |

## Summary

- Pages: 10 equivalent, 1 moved, 1 missing, 2 new
- Forms: 6 equivalent, 1 changed, 1 missing
- Workflows: 3 equivalent, 0 missing
- **Migration Score: 94.2%**
- **Recommendation: PROCEED_WITH_CONDITIONS**
```

Status icons:
- ✅ = equivalent/pass
- ⚠️ = changed/warning
- ❌ = missing/fail
