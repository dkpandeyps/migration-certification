# Inventory Schema — Reference and Examples

Full schema reference for `inventory.json` and `coverage-map.json`. See `shared/output-schemas.md` for the authoritative JSON schema. This file provides field-level documentation and populated examples.

---

## inventory.json — Field Reference

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique run identifier: `YYYYMMDD_HHmmss_targethost` |
| `target_url` | string | The root URL passed to discover-app |
| `discovered_at` | ISO string | When discovery completed |
| `login_mode` | string | `form` / `cookie` / `script` |
| `roles_used` | string[] | Which roles were used during discovery |
| `pages` | Page[] | All discovered pages |
| `forms` | Form[] | All discovered forms |
| `tables` | Table[] | All discovered data tables |
| `dialogs` | Dialog[] | All discovered modal dialogs |
| `workflows` | Workflow[] | All detected multi-step workflows |
| `api_endpoints` | Endpoint[] | All captured API endpoints |
| `navigation` | NavTree | Full menu/submenu hierarchy |
| `summary` | Summary | Counts and timing |

### Page Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `page_001`, `page_002`, ... |
| `url` | string | Normalized URL path (e.g., `/merchants`) |
| `url_concrete` | string | An actual observed URL (e.g., `/merchants?status=active`) |
| `title` | string | Page `<title>` or main heading text |
| `breadcrumb` | string[] | ["Home", "Merchants", "Create"] |
| `nav_path` | string[] | Which menu items lead here: ["Main Menu", "Merchants"] |
| `visible_to_roles` | string[] | Which roles can see this page |
| `page_type` | string | `dashboard`, `list`, `detail`, `form`, `report`, `settings`, `login`, `other` |
| `discovered_via` | string | `nav_click`, `direct_url`, `link`, `spa_route` |
| `screenshot_path` | string | Relative path to the discovery screenshot |
| `form_ids` | string[] | Forms found on this page |
| `table_ids` | string[] | Tables found on this page |

### Form Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `form_001`, `form_002`, ... |
| `page_id` | string | Which page this form was found on |
| `form_name` | string | Human-readable name (e.g., "Create Merchant") |
| `form_slug` | string | Slug for filenames (e.g., `create_merchant`) |
| `form_action` | string | API endpoint the form submits to |
| `form_method` | string | HTTP method (`POST`, `PUT`, `PATCH`) |
| `trigger` | string | `button`, `page_load`, `dialog`, `wizard_step` |
| `trigger_label` | string | Label of the button that opens this form |
| `visible_to_roles` | string[] | Which roles can see and use this form |
| `wizard` | bool | True if multi-step wizard |
| `wizard_steps` | Step[] | If wizard: each step's fields |
| `fields` | Field[] | All fields in this form |

### Field Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `field_001`, `field_002`, ... |
| `form_id` | string | Parent form reference |
| `field_name` | string | HTML name attribute or derived name |
| `field_label` | string | Human-readable label (cleaned, no asterisk) |
| `field_type` | string | `text`, `email`, `password`, `number`, `date`, `datetime`, `select`, `multiselect`, `checkbox`, `radio`, `file`, `textarea`, `tel`, `url`, `hidden` |
| `required` | bool | Whether the field is mandatory |
| `placeholder` | string / null | Placeholder text |
| `default_value` | string / null | Pre-filled value if any |
| `min_length` | int / null | Minimum character count |
| `max_length` | int / null | Maximum character count |
| `min` | string / null | For numbers/dates: minimum value |
| `max` | string / null | For numbers/dates: maximum value |
| `pattern` | string / null | Regex pattern from `pattern` attribute |
| `options` | Option[] | For select/radio/checkbox: available options |
| `depends_on` | string / null | Field ID this field depends on |
| `dependency_of` | string / null | Field ID that depends on this field |
| `validation_rules` | string[] | Extracted rules: `["required","email","max:100"]` |
| `visible_to_roles` | string[] | Which roles see this field |

### Workflow Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `workflow_001`, ... |
| `name` | string | Descriptive name (e.g., "Merchant Approval") |
| `discovery_type` | string | `wizard`, `status_transition`, `confirm_dialog` |
| `steps` | WorkflowStep[] | Ordered steps |
| `terminal_states` | string[] | What values indicate completion: ["Approved", "Rejected"] |
| `status_field` | string / null | Which field holds the current state |
| `trigger_page_id` | string | Page where this workflow starts |
| `visible_to_roles` | string[] | Which roles can execute this workflow |

---

## Populated Example: inventory.json (condensed)

```json
{
  "session_id": "20260611_142200_app_example_com",
  "target_url": "https://app.example.com",
  "discovered_at": "2026-06-11T16:00:00Z",
  "login_mode": "form",
  "roles_used": ["admin"],

  "pages": [
    {
      "id": "page_001",
      "url": "/dashboard",
      "title": "Dashboard — MyApp",
      "breadcrumb": ["Dashboard"],
      "nav_path": ["Dashboard"],
      "visible_to_roles": ["admin"],
      "page_type": "dashboard",
      "discovered_via": "nav_click",
      "screenshot_path": "discovery/screenshots/_dashboard.png",
      "form_ids": [],
      "table_ids": []
    },
    {
      "id": "page_002",
      "url": "/merchants",
      "title": "Merchants",
      "breadcrumb": ["Merchants"],
      "nav_path": ["Merchants", "All Merchants"],
      "visible_to_roles": ["admin"],
      "page_type": "list",
      "discovered_via": "nav_click",
      "screenshot_path": "discovery/screenshots/_merchants.png",
      "form_ids": ["form_001"],
      "table_ids": ["table_001"]
    }
  ],

  "forms": [
    {
      "id": "form_001",
      "page_id": "page_002",
      "form_name": "Create Merchant",
      "form_slug": "create_merchant",
      "form_action": "/api/merchants",
      "form_method": "POST",
      "trigger": "dialog",
      "trigger_label": "Add Merchant",
      "visible_to_roles": ["admin"],
      "wizard": false,
      "fields": [
        {
          "id": "field_001",
          "form_id": "form_001",
          "field_name": "business_name",
          "field_label": "Business Name",
          "field_type": "text",
          "required": true,
          "placeholder": "Enter business name",
          "default_value": null,
          "min_length": 2,
          "max_length": 100,
          "options": [],
          "depends_on": null,
          "dependency_of": null,
          "validation_rules": ["required", "min:2", "max:100"],
          "visible_to_roles": ["admin"]
        },
        {
          "id": "field_002",
          "form_id": "form_001",
          "field_name": "email",
          "field_label": "Email Address",
          "field_type": "email",
          "required": true,
          "placeholder": "admin@company.com",
          "min_length": 5,
          "max_length": 255,
          "validation_rules": ["required", "email", "max:255"],
          "visible_to_roles": ["admin"]
        }
      ]
    }
  ],

  "tables": [
    {
      "id": "table_001",
      "page_id": "page_002",
      "table_name": "Merchants List",
      "columns": ["ID", "Business Name", "Email", "Country", "Status", "Created"],
      "row_actions": ["View", "Edit", "Delete", "Activate", "Deactivate"],
      "bulk_actions": ["Export CSV", "Delete Selected"],
      "has_search": true,
      "has_filters": true,
      "filter_fields": ["status", "country"],
      "visible_to_roles": ["admin"]
    }
  ],

  "workflows": [
    {
      "id": "workflow_001",
      "name": "Merchant Approval",
      "discovery_type": "status_transition",
      "steps": [
        {"step": 1, "action": "admin_review", "trigger": "View record on pending list"},
        {"step": 2, "action": "click_approve_or_reject", "form_id": null, "button_labels": ["Approve", "Reject"]},
        {"step": 3, "action": "confirm_action", "dialog_id": "dialog_001"}
      ],
      "terminal_states": ["Approved", "Rejected"],
      "status_field": "merchant_status",
      "visible_to_roles": ["admin"]
    }
  ],

  "summary": {
    "total_pages": 12,
    "total_forms": 8,
    "total_fields": 47,
    "total_tables": 6,
    "total_dialogs": 4,
    "total_workflows": 3,
    "total_api_endpoints": 22,
    "discovery_duration_seconds": 340
  }
}
```

---

## coverage-map.json Initialization

When writing coverage-map.json after discovery, initialize every item as `not_covered`:

```python
# Pseudocode
for page in inventory.pages:
    coverage_map.page_coverage.items.append({"id": page.id, "status": "not_covered"})

for form in inventory.forms:
    coverage_map.form_coverage.items.append({"id": form.id, "status": "not_covered"})
    for field in form.fields:
        coverage_map.field_coverage.items.append({"id": field.id, "status": "not_covered"})

# ... same for workflows, api_endpoints
```

Set all counts to: `covered = 0`, `acknowledged_unreachable = 0`, `not_covered = total`.
