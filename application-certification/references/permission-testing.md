# Permission Testing — Three-Step Protocol for Role-Based Access Verification

This file is the instruction set for sub-agents testing permissions for one role.
Run this once per role. The orchestrating skill spawns one sub-agent per role.

---

## Setup

```bash
ROLE_NAME="{role_name}"
RESULTS_FILE="{SESSION_DIR}/test-results/permission-tests/$ROLE_NAME-matrix.json"
INVENTORY_FILE="{SESSION_DIR}/discovery/inventory.json"

# Login as this role
# (Use role-specific credentials — passed by orchestrator)
$BROWSE goto "{login_url}"
# ... follow login protocol from shared/browse-integration.md
```

---

## Step 1 — Structural Visibility Discovery

Compare what this role sees vs the admin baseline from discovery.

```bash
# Navigate to root and take nav snapshot
$BROWSE goto "{url}"
$BROWSE wait --networkidle
NAV_SNAPSHOT=$($BROWSE snapshot -i -a)

# Extract all visible nav items and URLs
VISIBLE_PAGES=$($BROWSE js "
  (() => {
  const links = [];
  document.querySelectorAll('nav a, .sidebar a, .menu a, [role=\"navigation\"] a').forEach(a => {
    if (a.offsetParent !== null && a.href && !a.href.startsWith('javascript:')) {
      links.push({label: a.textContent.trim(), url: new URL(a.href).pathname});
    }
  });
  return JSON.stringify(links);
})()")

$BROWSE screenshot "${TIMESTAMP}_perm_${ROLE_NAME}_nav.png"
```

Compare `VISIBLE_PAGES` against the full page list in `inventory.json`.

For each page in inventory:
- If visible in nav for this role: `accessible_via_nav = true`
- If NOT visible: `accessible_via_nav = false` (may still be directly accessible)

---

## Step 2 — Direct URL Access Testing

For every page in `inventory.json → pages[]`, attempt direct navigation:

```bash
for PAGE in $(cat $INVENTORY_FILE | jq -r '.pages[].url'); do
  $BROWSE goto "{base_url}$PAGE"
  $BROWSE wait --networkidle
  
  STATUS=$($BROWSE js "window.location.href")
  HTTP_STATUS=$(detect_access_result)  # See helper below
  
  $BROWSE screenshot "${TIMESTAMP}_perm_${ROLE_NAME}_page_${page_slug}.png"
  
  record_result("page", "$PAGE", "$HTTP_STATUS", "$ACCESSIBLE")
done
```

**Access Result Detection:**
```bash
detect_access_result() {
  local result=$($BROWSE js "
    (() => {
    // Check for common access denied indicators
    const url = window.location.href;
    const title = document.title.toLowerCase();
    const body = document.body.textContent.toLowerCase();
    
    if (url.includes('/login') || url.includes('/signin')) return 'redirected_to_login';
    if (title.includes('403') || title.includes('forbidden') || title.includes('access denied')) return '403';
    if (title.includes('404') || title.includes('not found')) return '404';
    if (body.includes('you do not have permission') || body.includes('access denied') || body.includes('unauthorized')) return 'content_denied';
    return '200';
})()")
  echo "$result"
}
```

---

## Step 3 — Action-Level Permission Testing

For each table in `inventory.json → tables[]` that this role can access:

```bash
$BROWSE goto "{table.page_url}"
$BROWSE wait --networkidle
$BROWSE snapshot -i -a

# Check which row actions are visible for this role
VISIBLE_ROW_ACTIONS=$($BROWSE js "
  (() => {
  const firstRow = document.querySelector('tbody tr:first-child');
  if (!firstRow) return '[]';
  return JSON.stringify([...firstRow.querySelectorAll('button, a[role=\"button\"]')]
    .filter(b => b.offsetParent !== null)
    .map(b => b.textContent.trim()));
})()")

# Compare against the full action list discovered during admin discovery (from inventory.json)
# Any action present for admin but missing for this role = permission restriction

# For actions that ARE visible, test if they actually work:
# Try clicking a row action (non-destructive: View, Edit)
# Record: allowed (200 response) or denied (403 response)
```

**API Endpoint Permission Testing:**
```bash
# For each API endpoint in inventory.json, attempt the call as this role
# Use the captured request shape from discovery

for ENDPOINT in $(cat $INVENTORY_FILE | jq -c '.api_endpoints[]'); do
  METHOD=$(echo $ENDPOINT | jq -r '.method')
  PATH=$(echo $ENDPOINT | jq -r '.path_example')
  SHAPE=$(echo $ENDPOINT | jq -r '.observed_request_shape')
  
  # Make the API call
  API_RESULT=$($BROWSE js "
    (() => {
    return fetch('{base_url}$PATH', {
      method: '$METHOD',
      headers: {'Content-Type': 'application/json'},
      body: $METHOD !== 'GET' ? JSON.stringify($SHAPE) : undefined
    }).then(r => r.status);
})()")
  
  record_api_result("$PATH", "$METHOD", "$API_RESULT")
done
```

---

## Building the Permission Matrix

After all three steps, compile results.

**Record the expected access for every resource**, not just what happened. That is what turns an observation into a
pass/fail test in the Test Case Register report:

- `expected_accessible` / `expected_allowed`: `true` or `false`, taken from the role design the user gave you
  (e.g. "merchant must not reach /system-settings"), or from the primary/admin baseline when the user confirmed that
  baseline is the intended design.
- `passed`: `true` when the observed access matches the expected access.
- If the intended access for a resource is genuinely unknown, set `expected_*` to `null` and omit `passed`. The report
  then shows it as ℹ️ RECORDED instead of inventing a verdict.

```json
{
  "role": "merchant",
  "tested_at": "2026-06-11T16:00:00Z",
  "credential_used": "{username}",

  "pages": [
    {
      "page_id": "page_001",
      "url": "/dashboard",
      "accessible_via_nav": true,
      "direct_access_result": "200",
      "accessible": true,
      "expected_accessible": true,
      "passed": true,
      "screenshot": "..."
    },
    {
      "page_id": "page_009",
      "url": "/system-settings",
      "accessible_via_nav": false,
      "direct_access_result": "redirected_to_login",
      "accessible": false,
      "expected_accessible": false,
      "passed": true,
      "screenshot": "..."
    }
  ],

  "actions": [
    {
      "table_id": "table_001",
      "action_label": "Delete",
      "visible_in_ui": false,
      "attempted_api_result": "403",
      "allowed": false,
      "expected_allowed": false,
      "passed": true
    }
  ],

  "api_endpoints": [
    {
      "endpoint_id": "api_001",
      "method": "DELETE",
      "path_pattern": "/api/merchants/{id}",
      "status_code": 403,
      "allowed": false,
      "expected_allowed": false,
      "passed": true
    }
  ],

  "summary": {
    "total_pages_tested": 12,
    "accessible_pages": 4,
    "denied_pages": 8,
    "total_actions_tested": 15,
    "allowed_actions": 6,
    "denied_actions": 9
  }
}
```

---

## Security Finding Flags

If the test reveals a permission violation (a role can access something it should not be able to):

1. Create a Critical defect in `defects.json`:
   - Title: `"{ROLE} can access {resource} — unauthorized access"`
   - Severity: Critical
   - Steps: the URL or action that was accessible
   - Evidence: screenshot of the accessible resource

2. Example violations to watch for:
   - Merchant role can access admin-only system settings
   - Support role can delete records (should be read-only)
   - Any role can access `/api/admin/*` endpoints without admin credentials
   - Role gets a 200 instead of expected 403 on a protected API endpoint

Update `coverage-map.json`: mark this role's permission coverage as `covered`.
