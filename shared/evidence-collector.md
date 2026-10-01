# Evidence Collector — Screenshot, API Log, and Console Log Conventions

Every test must produce evidence. A test without evidence is inadmissible in the certification report.

---

## Screenshot Conventions

### Naming Format
```
{YYYYMMDD_HHmmss}_{test-id}_{phase}.png
```

Where `phase` is one of:
- `before` — page state before the test action
- `after` — page state immediately after the action completes
- `error` — state when an error or unexpected result is visible

### Examples
```
20260611_152300_DEF_001_before.png    # Before submitting the invalid email
20260611_152310_DEF_001_after.png     # After submit — expected error shown
20260611_152315_DEF_001_error.png     # Error: no validation message appeared
```

### When to Capture

| Scenario | Screenshots Required |
|----------|---------------------|
| Positive test (valid input, success expected) | before + after |
| Negative test (invalid input, error expected) | before + after |
| Negative test FAIL (error expected but not shown) | before + after + error |
| CRUD Create | before (empty form) + after (success state, record in list) |
| CRUD Delete | before (record exists) + after (record gone) |
| Workflow step | before each step + after terminal state |
| Permission denied | screenshot of 403 page or hidden element |
| Permission allowed | screenshot of accessible page |

### Storage Location
```
{session_dir}/evidence/screenshots/
```

### Command
```bash
browse screenshot {session_dir}/evidence/screenshots/{filename}
```

Always use absolute paths.

---

## API Log Format

For every API call made during testing, capture a structured log entry.

### File naming
```
{session_dir}/evidence/api-logs/{method}_{path-slug}_{test-id}.json
```

Example: `evidence/api-logs/POST_api_merchants_DEF_001.json`

### Log structure
```json
{
  "test_id": "DEF_001",
  "endpoint_id": "api_001",
  "captured_at": "2026-06-11T15:23:00Z",
  "request": {
    "method": "POST",
    "url": "https://app.example.com/api/merchants",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer eyJ..."
    },
    "body": {
      "business_name": "Test Corp",
      "email": "notanemail",
      "country": "IN"
    }
  },
  "response": {
    "status_code": 200,
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "id": 1234,
      "status": "active"
    },
    "duration_ms": 342
  },
  "assertion": {
    "expected_status": 422,
    "actual_status": 200,
    "passed": false,
    "note": "Server accepted invalid email without validation error"
  }
}
```

### How to capture API calls

Enable network interception before navigating:
```bash
browse js "
  window.__apiLogs = [];
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const req = args[0];
    const opts = args[1] || {};
    const start = Date.now();
    const res = await origFetch(...args);
    const clone = res.clone();
    try {
      const body = await clone.json();
      window.__apiLogs.push({
        url: typeof req === 'string' ? req : req.url,
        method: opts.method || 'GET',
        requestBody: opts.body ? JSON.parse(opts.body) : null,
        status: res.status,
        responseBody: body,
        duration: Date.now() - start
      });
    } catch(e) {}
    return res;
  };
"
```

After the test action, read the logs:
```bash
browse js "JSON.stringify(window.__apiLogs)"
```

Write to the log file, then reset: `browse js "window.__apiLogs = []"`

---

## Console Log Format

Capture browser console errors and warnings during testing:

```bash
browse js "
  window.__consoleLogs = [];
  const orig = {log: console.log, warn: console.warn, error: console.error};
  ['log','warn','error'].forEach(level => {
    console[level] = function(...args) {
      window.__consoleLogs.push({level, message: args.join(' '), timestamp: new Date().toISOString()});
      orig[level].apply(console, args);
    };
  });
"
```

After the test, capture and write:
```bash
browse js "JSON.stringify(window.__consoleLogs)"
```

Write to: `{session_dir}/evidence/console-logs/{page-slug}_{test-id}.txt`

Format:
```
[2026-06-11T15:23:01.234Z] ERROR: Uncaught TypeError: Cannot read property 'id' of undefined
[2026-06-11T15:23:01.240Z] WARN: Deprecated API usage: window.localStorage deprecated in secure context
```

---

## Evidence Index

After each test, append to `evidence/evidence-index.json`:

```json
{
  "evidence": [
    {
      "test_id": "DEF_001",
      "form_id": "form_001",
      "field_id": "field_003",
      "test_type": "negative_invalid_format",
      "screenshots": [
        "evidence/screenshots/20260611_152300_DEF_001_before.png",
        "evidence/screenshots/20260611_152310_DEF_001_after.png"
      ],
      "api_logs": ["evidence/api-logs/POST_api_merchants_DEF_001.json"],
      "console_logs": ["evidence/console-logs/create_merchant_DEF_001.txt"],
      "captured_at": "2026-06-11T15:23:15Z"
    }
  ]
}
```

---

## Evidence Completeness Check

Before generating the final report, verify evidence completeness:

```
FOR EACH test result in test-results/:
  IF test result has no screenshot path → mark as evidence_incomplete
  IF screenshot path does not point to an existing file → mark as evidence_broken
  
IF any evidence_incomplete OR evidence_broken:
  Set GATE_EVIDENCE = false in certification-result.json
  List all incomplete evidence items in the report
```

The production readiness gate requires `evidence_complete = true` for all test results.
