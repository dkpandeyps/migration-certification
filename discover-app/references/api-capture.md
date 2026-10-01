# API Capture — Network Traffic Interception and Endpoint Classification

Every API call made by the UI during discovery and testing must be captured and recorded.

---

## Setup

Run this once after login (per `shared/browse-integration.md → Network Interception Setup`). The script patches `window.fetch` and `XMLHttpRequest` to capture all network calls.

Additionally, patch XHR:
```bash
$BROWSE js "
  if (!window.__xhrPatched) {
    window.__xhrPatched = true;
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__method = method;
      this.__url = url;
      this.__start = Date.now();
      origOpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
      this.addEventListener('load', function() {
        let responseBody = null;
        try { responseBody = JSON.parse(this.responseText); } 
        catch(e) { responseBody = this.responseText.substring(0, 500); }
        
        let requestBody = null;
        try { requestBody = JSON.parse(body); }
        catch(e) { requestBody = body; }
        
        (window.__apiLogs = window.__apiLogs || []).push({
          url: this.__url,
          method: this.__method,
          requestBody: requestBody,
          requestHeaders: {},
          status: this.status,
          responseBody: responseBody,
          duration: Date.now() - this.__start,
          timestamp: new Date().toISOString()
        });
      });
      origSend.apply(this, arguments);
    };
  }
"
```

---

## Endpoint Classification

After capturing endpoints, classify each by examining the method and URL pattern:

| Pattern | Classification |
|---------|---------------|
| POST `/auth/*`, POST `/login`, POST `/token` | AUTH |
| GET `/api/{resource}` or GET `/api/{resource}/{id}` | CRUD_READ |
| POST `/api/{resource}` | CRUD_CREATE |
| PUT or PATCH `/api/{resource}/{id}` | CRUD_UPDATE |
| DELETE `/api/{resource}/{id}` | CRUD_DELETE |
| GET `/api/{resource}/export`, GET `*/download*` | EXPORT |
| POST `/api/{resource}/import`, POST `*/upload*` | IMPORT |
| GET `/api/{resource}/report`, GET `*/reports/*` | REPORT |
| POST `*/approve`, POST `*/reject`, POST `*/activate` | WORKFLOW_TRANSITION |
| WebSocket `ws://` or `wss://` | WEBSOCKET |
| Everything else | OTHER |

---

## Path Pattern Normalization

Convert concrete paths to patterns by replacing IDs:

```bash
normalize_api_path() {
  echo "$1" | sed 's|/[0-9]\+|/{id}|g' | sed 's|/[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}|/{uuid}|g'
}
```

Examples:
- `/api/merchants/123` → `/api/merchants/{id}`
- `/api/merchants/550e8400-e29b-41d4-a716-446655440000` → `/api/merchants/{uuid}`
- `/api/merchants/123/documents/456` → `/api/merchants/{id}/documents/{id}`

Two calls with the same normalized path + method = same endpoint.

---

## Building api-inventory.json

After each page visit, merge new endpoints into the running API inventory:

```bash
read_api_logs() {
  $BROWSE js "JSON.stringify(window.__apiLogs || [])"
}

merge_api_logs() {
  local new_logs="$1"
  # For each log entry:
  # 1. Normalize the path
  # 2. Check if (method + normalized_path) already exists in api_endpoints[]
  # 3. If new: add with all fields
  # 4. If existing: update observed_status_codes[] and observed_response_shape
}
```

The `api-inventory.json` file tracks unique endpoints across the entire session.

---

## Capturing GraphQL

For GraphQL APIs, the endpoint is always the same URL (e.g., `/graphql`). Differentiate by operation name:

```bash
$BROWSE js "
  // Detect GraphQL calls in the existing log
  (window.__apiLogs || []).filter(l => l.url.includes('/graphql')).map(l => ({
    ...l,
    graphql_operation: l.requestBody && l.requestBody.operationName,
    graphql_query_type: l.requestBody && l.requestBody.query && 
      (l.requestBody.query.trim().startsWith('mutation') ? 'mutation' : 'query')
  }));
"
```

Record each unique GraphQL operation name as a separate endpoint in `api-inventory.json`.

---

## Final Output: api-inventory.json

```json
{
  "session_id": "...",
  "total_endpoints": 22,
  "endpoints": [
    {
      "id": "api_001",
      "method": "POST",
      "path_pattern": "/api/merchants",
      "path_example": "/api/merchants",
      "classification": "CRUD_CREATE",
      "observed_request_shape": {
        "business_name": "string",
        "country": "string",
        "email": "string"
      },
      "observed_response_shape": {
        "id": "number",
        "status": "string",
        "created_at": "string"
      },
      "observed_status_codes": [201, 400, 422],
      "call_count": 3,
      "visible_to_roles": ["admin"],
      "last_seen_on_page": "page_003"
    }
  ]
}
```

Write to: `{SESSION_DIR}/discovery/api-inventory.json`

---

## API Log Per Test

During testing (not just discovery), write individual API logs per test execution:

```json
// evidence/api-logs/POST_api_merchants_field_001_test_negative_blank.json
{
  "test_id": "form_001_field_003_negative_blank",
  "endpoint_id": "api_001",
  "request": { ... },
  "response": { ... },
  "assertion": {
    "expected_status": 422,
    "actual_status": 200,
    "passed": false
  }
}
```

This links each API response to the specific test case that triggered it.
