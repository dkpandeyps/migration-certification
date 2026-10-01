# Output Schemas — Enterprise Certification Framework

All skills in this framework produce machine-readable artifacts with these schemas.
Fields marked `(runtime)` are populated during testing, not discovery.

---

## inventory.json

```json
{
  "session_id": "20260611_142200_myapp",
  "target_url": "https://app.example.com",
  "discovered_at": "2026-06-11T14:22:00Z",
  "login_mode": "form",
  "roles_used": ["admin", "merchant"],

  "pages": [
    {
      "id": "page_001",
      "url": "/dashboard",
      "title": "Dashboard",
      "breadcrumb": ["Home", "Dashboard"],
      "nav_path": ["Main Menu", "Dashboard"],
      "visible_to_roles": ["admin", "merchant"],
      "page_type": "dashboard | list | detail | form | report | settings | login | other",
      "discovered_via": "nav_click | direct_url | link | spa_route",
      "screenshot_path": "discovery/screenshots/dashboard.png"
    }
  ],

  "forms": [
    {
      "id": "form_001",
      "page_id": "page_002",
      "form_name": "Create Merchant",
      "form_action": "/api/merchants",
      "form_method": "POST",
      "trigger": "button | page_load | dialog",
      "trigger_label": "Add Merchant",
      "visible_to_roles": ["admin"],
      "fields": [
        {
          "id": "field_001",
          "form_id": "form_001",
          "field_name": "business_name",
          "field_label": "Business Name",
          "field_type": "text | email | password | number | date | datetime | select | multiselect | checkbox | radio | file | textarea | tel | url | hidden",
          "required": true,
          "placeholder": "Enter business name",
          "default_value": null,
          "min_length": 2,
          "max_length": 100,
          "pattern": null,
          "options": [],
          "dependency_of": null,
          "depends_on": null,
          "validation_rules": ["required", "min:2", "max:100"]
        },
        {
          "id": "field_002",
          "form_id": "form_001",
          "field_name": "country",
          "field_label": "Country",
          "field_type": "select",
          "required": true,
          "options": [
            {"value": "IN", "label": "India"},
            {"value": "US", "label": "United States"},
            {"value": "CA", "label": "Canada"}
          ],
          "depends_on": null,
          "dependency_of": "field_003"
        }
      ]
    }
  ],

  "tables": [
    {
      "id": "table_001",
      "page_id": "page_002",
      "table_name": "Merchants List",
      "columns": ["ID", "Name", "Country", "Status", "Created At"],
      "row_actions": ["View", "Edit", "Delete", "Activate", "Deactivate"],
      "bulk_actions": ["Export", "Delete Selected"],
      "has_search": true,
      "has_filters": true,
      "has_pagination": true,
      "filter_fields": ["status", "country", "date_range"],
      "visible_to_roles": ["admin"]
    }
  ],

  "dialogs": [
    {
      "id": "dialog_001",
      "page_id": "page_002",
      "trigger_label": "Delete",
      "trigger_row_action_id": "table_001_delete",
      "dialog_type": "confirm | form | info",
      "title": "Confirm Delete",
      "contains_form_id": null
    }
  ],

  "workflows": [
    {
      "id": "workflow_001",
      "name": "Merchant Onboarding",
      "discovery_type": "wizard | status_transition | confirm_dialog",
      "steps": [
        {"step": 1, "action": "fill_form", "form_id": "form_001"},
        {"step": 2, "action": "upload_documents", "form_id": "form_002"},
        {"step": 3, "action": "click_submit", "button_label": "Submit for Review"}
      ],
      "terminal_states": ["Approved", "Rejected"],
      "status_field": "merchant_status",
      "visible_to_roles": ["admin"]
    }
  ],

  "api_endpoints": [
    {
      "id": "api_001",
      "method": "POST",
      "path_pattern": "/api/merchants",
      "path_example": "/api/merchants",
      "classification": "AUTH | CRUD_CREATE | CRUD_READ | CRUD_UPDATE | CRUD_DELETE | REPORT | EXPORT | UPLOAD | OTHER",
      "observed_request_shape": {"business_name": "string", "country": "string"},
      "observed_response_shape": {"id": "number", "status": "string"},
      "observed_status_codes": [201, 400, 422],
      "visible_to_roles": ["admin"]
    }
  ],

  "navigation": {
    "menu_structure": [
      {
        "label": "Merchants",
        "url": "/merchants",
        "children": [
          {"label": "All Merchants", "url": "/merchants"},
          {"label": "Pending Approval", "url": "/merchants?status=pending"}
        ]
      }
    ]
  },

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

## coverage-map.json

```json
{
  "session_id": "20260611_142200_myapp",
  "last_updated": "2026-06-11T16:45:00Z",

  "page_coverage": {
    "total": 12,
    "covered": 10,
    "acknowledged_unreachable": 1,
    "not_covered": 1,
    "percentage": 91.7,
    "items": [
      {"id": "page_001", "status": "covered | not_covered | acknowledged_unreachable", "covered_at": "2026-06-11T15:00:00Z"},
      {"id": "page_002", "status": "acknowledged_unreachable", "justification": "Error page only reachable after server crash — not reproducible in test env", "acknowledged_by": "QA Lead"}
    ]
  },

  "form_coverage": {
    "total": 8, "covered": 7, "acknowledged_unreachable": 0, "not_covered": 1, "percentage": 87.5,
    "items": []
  },

  "field_coverage": {
    "total": 47, "covered": 47, "acknowledged_unreachable": 0, "not_covered": 0, "percentage": 100.0,
    "items": []
  },

  "workflow_coverage": {
    "total": 3, "covered": 3, "acknowledged_unreachable": 0, "not_covered": 0, "percentage": 100.0,
    "items": []
  },

  "permission_coverage": {
    "total": 24,
    "covered": 24,
    "acknowledged_unreachable": 0,
    "not_covered": 0,
    "percentage": 100.0,
    "items": []
  },

  "api_coverage": {
    "total": 22, "covered": 18, "acknowledged_unreachable": 2, "not_covered": 2, "percentage": 90.9,
    "items": []
  }
}
```

---

## defects.json

```json
{
  "session_id": "20260611_142200_myapp",
  "generated_at": "2026-06-11T16:50:00Z",
  "total_defects": 3,
  "by_severity": {"critical": 0, "high": 1, "medium": 2, "low": 0},

  "defects": [
    {
      "id": "DEF_001",
      "title": "Email field accepts invalid format 'notanemail'",
      "severity": "critical | high | medium | low",
      "module": "Merchant Registration",
      "form_id": "form_001",
      "field_id": "field_003",
      "test_type": "negative_invalid_format",
      "environment": "https://app.example.com",
      "discovered_at": "2026-06-11T15:23:00Z",
      "steps_to_reproduce": [
        "Navigate to /merchants/create",
        "Enter 'notanemail' in the Email field",
        "Click Submit"
      ],
      "expected_result": "Validation error: 'Please enter a valid email address'",
      "actual_result": "Form submitted successfully with invalid email",
      "evidence_screenshots": [
        "evidence/screenshots/20260611_152300_DEF_001_before.png",
        "evidence/screenshots/20260611_152310_DEF_001_after.png"
      ],
      "api_log_path": "evidence/api-logs/post_api_merchants.json",
      "jira_key": null
    }
  ]
}
```

---

## certification-result.json

```json
{
  "session_id": "20260611_142200_myapp",
  "target_url": "https://app.example.com",
  "role_tested": "admin",
  "certification_type": "application | migration",
  "started_at": "2026-06-11T14:22:00Z",
  "completed_at": "2026-06-11T17:10:00Z",
  "duration_minutes": 168,

  "verdict": "PASS | FAIL",
  "score": 87,

  "gates": {
    "page_coverage":        {"required": 100, "actual": 100, "passed": true},
    "form_coverage":        {"required": 100, "actual": 87.5, "passed": false},
    "field_coverage":       {"required": 100, "actual": 100, "passed": true},
    "uiux_coverage":        {"required": 100, "actual": 87.5, "passed": false},
    "workflow_coverage":    {"required": 100, "actual": 100, "passed": true},
    "permission_coverage":  {"required": 100, "actual": 100, "passed": true},
    "api_coverage":         {"required": 80,  "actual": 90.9, "passed": true},
    "critical_defects":     {"required": 0,   "actual": 0,    "passed": true},
    "evidence_complete":    {"required": true, "actual": true, "passed": true}
  },

  "uncovered_items": [
    {"type": "form", "id": "form_007", "name": "Bulk Import Form", "reason": "Import feature behind feature flag not enabled in test env"}
  ],

  "defect_summary": {
    "total": 3,
    "critical": 0, "high": 1, "medium": 2, "low": 0
  },

  "coverage_summary": {
    "page": 100.0, "form": 87.5, "field": 100.0, "uiux": 87.5,
    "workflow": 100.0, "permission": 100.0, "api": 90.9
  },

  "residual_risks": [],

  "paysec_review": {
    "qa_summary": null,
    "eng_review_summary": null,
    "ceo_review_summary": null
  },

  "artifacts": {
    "inventory": "discovery/inventory.json",
    "coverage_map": "discovery/coverage-map.json",
    "defects": "defects/defects.json",
    "jira_bugs": "defects/jira-bugs.json",
    "reports_dir": "reports/"
  }
}
```

---

## permission-matrix.json

```json
{
  "session_id": "20260611_142200_myapp",
  "generated_at": "2026-06-11T16:30:00Z",
  "roles_tested": ["admin", "merchant", "support"],

  "matrix": [
    {
      "role": "admin",
      "pages": [
        {"page_id": "page_001", "url": "/dashboard", "accessible": true, "status_code": 200},
        {"page_id": "page_009", "url": "/system-settings", "accessible": true, "status_code": 200}
      ],
      "actions": [
        {"action_id": "table_001_delete", "label": "Delete Merchant", "allowed": true, "status_code": 200},
        {"action_id": "table_001_approve", "label": "Approve Merchant", "allowed": true, "status_code": 200}
      ],
      "api_endpoints": [
        {"endpoint_id": "api_001", "method": "DELETE", "path": "/api/merchants/:id", "allowed": true, "status_code": 200}
      ]
    }
  ]
}
```

---

## migration-gap-report.json

```json
{
  "session_id": "20260611_142200_migration",
  "old_url": "https://legacy.example.com",
  "new_url": "https://new.example.com",
  "generated_at": "2026-06-11T18:00:00Z",
  "migration_score": 94.2,

  "gaps": {
    "missing_features": [
      {
        "id": "GAP_001",
        "severity": "critical",
        "type": "missing_feature",
        "description": "Bulk Import form present in legacy, not found in new system",
        "old_item": {"type": "form", "id": "form_007", "url": "/merchants/import"},
        "new_item": null
      }
    ],
    "functional_regressions": [
      {
        "id": "GAP_002",
        "severity": "critical",
        "type": "functional_regression",
        "description": "Email validation passed on legacy, fails on new system",
        "old_result": "PASS",
        "new_result": "FAIL",
        "test_case": {"form_id": "form_001", "field_id": "field_003", "test_type": "positive_valid"}
      }
    ],
    "behavioral_drifts": [
      {
        "id": "GAP_003",
        "severity": "high",
        "type": "behavioral_drift",
        "layer": "validation_message",
        "description": "Error message wording changed",
        "old_value": "Email is required",
        "new_value": "Please provide an email address",
        "field_id": "field_003"
      }
    ],
    "new_features": [],
    "validation_changes": []
  },

  "totals": {
    "missing_features": 1,
    "functional_regressions": 1,
    "behavioral_drifts": 1,
    "new_features": 0,
    "validation_changes": 0
  }
}
```
