# Gap Analysis — Classification, Severity, and Reporting

---

## Gap Taxonomy

| Gap Type | Definition | Severity | Action |
|----------|-----------|----------|--------|
| `missing_feature` | Page, form, or workflow in legacy; absent in new | Critical | Must be implemented before go-live |
| `functional_regression` | Test passed on legacy, fails on new (same test case) | Critical | Must be fixed before go-live |
| `new_regression` | Test failed on legacy (correctly rejected), passes on new (incorrectly accepted) | Critical | New system is more permissive than expected — security/data risk |
| `behavioral_drift` | Both systems respond, but differently (message, format, shape) | High | Review intentionality — some may be acceptable changes |
| `validation_change` | Same field, different validation rules | Medium | Review whether the change was intentional |
| `api_structural_change` | API response structure changed | High | May break integrations |
| `data_format_change` | Data stored or displayed in different format | Medium | May break exports, reports, or integrations |
| `permission_escalation` | A role can do or see something on new that it was denied on legacy | Critical | Fix before go-live — access-control regression |
| `role_login_mismatch` | A role can log in on one system but not the other | Critical | Fix role/user setup before re-running |
| `permission_loss` | A role lost access on new that it had on legacy | High (Critical if the role's `expected` needs it) | Confirm it was intentional, otherwise restore |
| `permission_drift` | Hidden in the new UI but still reachable by direct URL / API | High | Enforce on the server, not only in the UI |
| `new_feature` | Feature in new system, not in legacy | Informational | Document — no action required |

---

## Gap Report Construction Algorithm

```
gaps = {
  missing_features: [],
  functional_regressions: [],
  new_regressions: [],
  behavioral_drifts: [],
  validation_changes: [],
  api_structural_changes: [],
  data_format_changes: [],
  permission_gaps: [],
  new_features: []
}

# From inventory-diff.json
for page in inventory_diff.pages.items where status = "missing":
  gaps.missing_features.append({
    type: "missing_feature",
    resource_type: "page",
    severity: "critical",
    old_item: {id, url, title},
    new_item: null,
    description: "Page '{title}' ({url}) exists in legacy, not found in new system"
  })

for form in inventory_diff.forms.items where status = "missing":
  gaps.missing_features.append({...})

for workflow in inventory_diff.workflows.items where status = "missing":
  gaps.missing_features.append({...})

# From behavioral-diff.json
for item in behavioral_diff.functional_regressions:
  gaps.functional_regressions.append({...})

for item in behavioral_diff.behavioral_drifts:
  gaps.behavioral_drifts.append({...})

for item in behavioral_diff.permission_differences:
  gaps.permission_gaps.append({...})   # keep role, resource, old_access, new_access, evidence

# Assign gap IDs: GAP_001, GAP_002, ...
```

---

## Gap Severity to Migration Recommendation Mapping

After all gaps are classified:

```
critical_gaps = count(missing_features) + count(functional_regressions) + count(new_regressions)
              + count(permission_gaps where severity = "critical")
high_gaps = count(behavioral_drifts) + count(api_structural_changes)
          + count(permission_gaps where severity = "high")
migration_score = (equivalent_features / total_old_features) * 100

IF completeness check failed on either system (migration Phase 5b):
  recommendation = "INCOMPLETE"   # never PROCEED on a partial run
ELIF critical_gaps = 0 AND migration_score = 100:
  recommendation = "PROCEED"
ELIF critical_gaps = 0 AND migration_score >= 90:
  recommendation = "PROCEED_WITH_CONDITIONS"
  conditions = list all high_gaps
ELSE:
  recommendation = "HOLD"
  blockers = list all critical_gaps
```

---

## migration-gap-report.json Structure

```json
{
  "session_id": "...",
  "old_url": "https://legacy.example.com",
  "new_url": "https://new.example.com",
  "generated_at": "2026-06-11T18:00:00Z",
  "migration_score": 94.2,
  "recommendation": "PROCEED_WITH_CONDITIONS",
  "recommendation_conditions": [
    "GAP_003: Behavioral drift in validation message for email field — verify if intentional",
    "GAP_004: API response shape changed for /api/merchants endpoint — check integration consumers"
  ],

  "gaps": {
    "missing_features": [
      {
        "id": "GAP_001",
        "severity": "critical",
        "type": "missing_feature",
        "resource_type": "form",
        "description": "Bulk Import form (/merchants/import) exists in legacy, not found in new system",
        "old_item": {"type": "form", "id": "form_007", "name": "Bulk Import", "url": "/merchants/import"},
        "new_item": null,
        "action_required": "Implement bulk import feature in new system before go-live"
      }
    ],
    "functional_regressions": [],
    "new_regressions": [],
    "behavioral_drifts": [
      {
        "id": "GAP_003",
        "severity": "medium",
        "type": "behavioral_drift",
        "layer": "validation_message",
        "description": "Email required error message wording changed",
        "old_value": "Email is required",
        "new_value": "Please provide an email address",
        "action_required": "Verify if this change was intentional. If not, align messages."
      }
    ],
    "validation_changes": [],
    "api_structural_changes": [],
    "data_format_changes": [],
    "permission_gaps": [],
    "new_features": [
      {
        "id": "GAP_NF_001",
        "type": "new_feature",
        "description": "New system has 2FA settings page (/security/2fa) not present in legacy",
        "new_item": {"url": "/security/2fa"},
        "action_required": "None — informational only"
      }
    ]
  },

  "totals": {
    "critical": 1,
    "high": 0,
    "medium": 1,
    "informational": 1,
    "total_gaps": 3
  }
}
```
