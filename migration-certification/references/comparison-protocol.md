# Comparison Protocol — Inventory Diff and 5-Layer Behavioral Comparison

---

## Part A: Inventory Diff

### Page Matching Algorithm

For each page in `old_inventory.pages[]`:

1. **Exact URL match:** Find the same URL in `new_inventory.pages[]` → `status = "equivalent"`
2. **Normalized URL match:** Strip IDs, compare pattern → if pattern matches, `status = "equivalent"`
3. **Title similarity:** If no URL match, compare page titles (Levenshtein distance ≤ 3 words) → `status = "moved"`
4. **Content similarity:** Compare form_ids and table_ids on the page — if ≥ 70% overlap → `status = "moved"`
5. **No match found:** `status = "missing"`

For each page in `new_inventory.pages[]` that has no match in old inventory:
→ `status = "new"` (not a gap — informational)

### Form Matching Algorithm

For each form in `old_inventory.forms[]`:
1. Match by `form_action` URL (same API endpoint) → `status = "equivalent"`
2. Match by field set similarity (≥ 70% of fields have same `field_name`) → `status = "equivalent"` or `status = "changed"`
3. No match → `status = "missing"`

For matched forms, compare field by field:
- Field in old, not in new → `removed_field`
- Field in new, not in old → `added_field`
- Field in both but different `field_type`, `required`, or `validation_rules` → `changed_field`

### Write inventory-diff.json

```json
{
  "pages": {
    "total_old": 12,
    "equivalent": 10,
    "moved": 1,
    "missing": 1,
    "new_in_new": 2,
    "items": [
      {"old_id": "page_001", "old_url": "/merchants", "new_id": "page_001", "new_url": "/merchants", "status": "equivalent"},
      {"old_id": "page_009", "old_url": "/bulk-import", "new_id": null, "new_url": null, "status": "missing"}
    ]
  },
  "forms": {
    "total_old": 8,
    "equivalent": 6,
    "changed": 1,
    "missing": 1,
    "items": [
      {
        "old_id": "form_001",
        "new_id": "form_001",
        "status": "changed",
        "removed_fields": ["field_phone_ext"],
        "added_fields": ["field_mobile"],
        "changed_fields": [{"field": "field_email", "change": "max_length changed from 100 to 255"}]
      }
    ]
  },
  "workflows": {
    "total_old": 3,
    "equivalent": 3,
    "missing": 0,
    "items": []
  },
  "api_endpoints": {
    "total_old": 22,
    "equivalent": 20,
    "removed": 1,
    "added": 3,
    "items": []
  }
}
```

---

## Part B: Behavioral Diff (5 Layers)

### Layer 1 — Pass/Fail Parity

For each test case that ran on BOTH systems (matched by `test_id` from form slug + field name + test type):

```json
{
  "test_id": "form_001_field_002_negative_invalid_format",
  "old_result": "passed",
  "new_result": "failed",
  "parity": false,
  "gap_type": "functional_regression",
  "severity": "critical"
}
```

- `old=pass, new=fail` → **functional_regression** (Critical)
- `old=fail, new=pass` → **new_regression** (Critical — new system is more permissive)
- Both pass or both fail → **parity** (OK)

### Layer 2 — Validation Message Match

For each test case where `expected_outcome = "fail"` on BOTH systems:

```bash
# Extract error message from each system's result
OLD_MSG=$(cat old/test-results/form-tests/{form}-results.json | jq -r '.test_cases[] | select(.test_id=="{id}") | .error_message_shown')
NEW_MSG=$(cat new/test-results/form-tests/{form}-results.json | jq -r '.test_cases[] | select(.test_id=="{id}") | .error_message_shown')

if [ "$OLD_MSG" != "$NEW_MSG" ]; then
  record_behavioral_drift("validation_message", old_msg, new_msg)
fi
```

- Messages differ → **behavioral_drift** (Medium)
- Messages identical → OK

### Layer 3 — API Response Structure Match

For each API endpoint covered by both systems, compare response shapes:

```bash
OLD_SHAPE=$(cat old/discovery/api-inventory.json | jq '.endpoints[] | select(.id=="{id}") | .observed_response_shape')
NEW_SHAPE=$(cat new/discovery/api-inventory.json | jq '.endpoints[] | select(.id=="{id}") | .observed_response_shape')

# Structural comparison (key names and types, not values)
diff_json_shapes "$OLD_SHAPE" "$NEW_SHAPE"
```

- Key removed from response → **behavioral_drift** (High — consumers may break)
- Key added to response → **new_feature** (Informational)
- Key type changed → **behavioral_drift** (High)

### Layer 4 — Post-Action Data State Match

After running the CRUD Create test on both systems, compare the created record's field values:

```bash
OLD_CREATED=$(cat old/test-results/crud-tests/{module}-results.json | jq '.test_results[] | select(.action=="create") | .created_record_data')
NEW_CREATED=$(cat new/test-results/crud-tests/{module}-results.json | jq '.test_results[] | select(.action=="create") | .created_record_data')

# Field-by-field comparison (semantically equivalent, not byte-equal)
# e.g., date "2026-06-11" vs "11/06/2026" = same date, different format = behavioral_drift
```

**Shared database (`shared_db=true`):** when both systems write to the same database, also prove parity across them:
- A record created on the new system must be readable on the legacy system with the same field values, and vice versa.
- An edit made on one system must show on the other after reload.
- Any mismatch → `data_state_differences[]` with `"cross_system": true` (High — the new app is writing data the legacy app reads differently).
- Every record the run creates must carry the session tag (`CERT_{session_id}_` prefix in a name/reference field) so it can be found on both sides and cleaned up afterwards.

### Layer 5 — Permission Parity (per role)

For every role tested on both systems (primary role + every role in `roles_file`), compare
`old/test-results/permission-tests/{role}-matrix.json` with `new/test-results/permission-tests/{role}-matrix.json`.
Match resources through `inventory-diff.json` (legacy page/action → its new equivalent).

| Legacy | New | Result | Severity |
|---|---|---|---|
| allowed | allowed | parity | — |
| denied | denied | parity | — |
| denied | **allowed** | `permission_escalation` — role can now reach something it could not before | Critical |
| allowed | **denied** | `permission_loss` — role lost access it had | High (Critical if the role's `expected` says it needs this) |
| allowed in nav | hidden in nav but direct URL works | `permission_drift` — UI hides it, server still allows it | High |
| tested | not tested | `role_untested` — the comparison is incomplete for this role | Blocks the run (see migration Phase 5b) |

A role that logged in on one system but failed to log in on the other is recorded as `role_login_mismatch` (Critical).


---

## Write behavioral-diff.json

```json
{
  "functional_regressions": [
    {
      "id": "BD_001",
      "layer": 1,
      "severity": "critical",
      "form_id": "form_001",
      "field_id": "field_002",
      "test_type": "negative_invalid_format",
      "old_result": "fail (validation shown)",
      "new_result": "pass (accepted invalid input)",
      "description": "Email validation accepted invalid format on new system"
    }
  ],
  "behavioral_drifts": [
    {
      "id": "BD_002",
      "layer": 2,
      "severity": "medium",
      "old_value": "Email is required",
      "new_value": "Please provide an email address",
      "description": "Validation message wording changed for email required check"
    }
  ],
  "api_structural_changes": [],
  "data_state_differences": [],
  "permission_differences": [
    {
      "id": "BD_010",
      "layer": 5,
      "role": "merchant",
      "resource": "Global MID Rule → Delete",
      "old_access": "denied",
      "new_access": "allowed",
      "gap_type": "permission_escalation",
      "severity": "critical",
      "evidence": ["evidence/screenshots/..._perm_merchant_delete.png"]
    }
  ],
  "roles_compared": ["admin", "merchant", "support"],
  "totals": {
    "functional_regressions": 1,
    "behavioral_drifts": 1,
    "api_structural_changes": 0,
    "data_state_differences": 0,
    "permission_differences": 1
  }
}
```
