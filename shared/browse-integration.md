# Browse Tool Integration — Playwright-Backed Browser Automation

The `browse` binary is the execution layer for all browser automation in this framework.
It is a compiled Playwright + Chromium binary provided by the **paysec** toolkit
(`~/.claude/skills/paysec`, skill `/browser`).

---

## Binary Location Resolution

At the start of every skill that uses the browser, resolve the binary path:

```bash
# PAYSEC_BROWSE_BIN overrides everything (same variable paysec's own tools use)
BROWSE="${PAYSEC_BROWSE_BIN:-}"

_PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
for _cand in \
  ${_PROJECT_ROOT:+"$_PROJECT_ROOT/.claude/skills/paysec/browser/dist/browse"} \
  "$HOME/.claude/skills/paysec/browser/dist/browse" \
  "$USERPROFILE/.claude/skills/paysec/browser/dist/browse"; do
  [ -n "$BROWSE" ] && break
  if [ -x "$_cand" ]; then BROWSE="$_cand"            # macOS / Linux
  elif [ -x "$_cand.exe" ]; then BROWSE="$_cand.exe"  # Windows
  fi
done

if [ -z "$BROWSE" ]; then
  echo "BLOCKED: paysec browse binary not found."
  echo "Install paysec: git clone <your-paysec-repo-url> ~/.claude/skills/paysec && cd ~/.claude/skills/paysec && ./setup"
  exit 1
fi
```

**Password fields:** some target apps have a visible
`input#floatingPassword` and a hidden `input[name=password]`. Always fill `input#floatingPassword` or `input[type=password]`.

---

## Core Commands Reference

### Navigation
```bash
$BROWSE goto "https://app.example.com/merchants"
$BROWSE goto "https://app.example.com/merchants" && $BROWSE wait --networkidle
```

### Snapshots
```bash
# Interactive elements only (forms, buttons, links)
$BROWSE snapshot -i

# Annotated (elements labeled with @e1, @e2 refs)
$BROWSE snapshot -a

# Both (most common — use for discovery)
$BROWSE snapshot -i -a

# Diff mode (shows what changed since last snapshot)
$BROWSE snapshot -D
```

Elements are returned with reference IDs like `@e1`, `@e2`. Use these refs in subsequent commands.

### Form Interaction
```bash
# Fill a text/email/number input
$BROWSE fill @e3 "test@example.com"

# Select a dropdown option
$BROWSE select @e5 "India"

# Check / uncheck a checkbox (there is no check/uncheck command — click toggles it,
# then confirm the state with: $BROWSE is checked @e7)
$BROWSE click @e7

# Upload a file
$BROWSE upload @e9 "/tmp/test-document.pdf"

# Clear a field
$BROWSE fill @e3 ""
```

### Clicking
```bash
$BROWSE click @e4                    # Click by ref
$BROWSE click "text=Submit"          # Click by visible text
$BROWSE click "button[type=submit]"  # Click by CSS selector
```

### Keyboard
```bash
$BROWSE press Escape
$BROWSE press Enter
$BROWSE press Tab
```

### Screenshots
```bash
$BROWSE screenshot /absolute/path/to/output.png              # full page (default)
$BROWSE screenshot --viewport /absolute/path/to/output.png   # visible viewport only
```

### JavaScript Execution
`js` evaluates an **expression** and prints its value. A top-level `return` is a syntax error.
For multi-statement code, either end with a bare expression or wrap it in an IIFE:
```bash
$BROWSE js "document.title"
$BROWSE js "JSON.stringify([...document.querySelectorAll('a')].map(a => a.href))"
$BROWSE js "const n = document.forms.length; n > 0"                  # last expression is the result
$BROWSE js "(() => { const f = document.forms; return f.length; })()" # IIFE when you need return
```

### Waiting
```bash
$BROWSE wait --networkidle   # all network requests finished
$BROWSE wait --load          # page load event
$BROWSE wait ".success"      # element matching a CSS selector appears
$BROWSE js "document.body.innerText.includes('Successfully created')"   # check for text (true/false)
sleep 2                      # fixed pause in seconds — use sparingly (browse has no "wait <ms>")
```

### Hovering
```bash
$BROWSE hover @e12
```

---

## Network Interception Setup

Run this JavaScript once after login to intercept all API calls for the session:

```bash
$BROWSE js "
  if (!window.__certFrameworkInitialized) {
    window.__certFrameworkInitialized = true;
    window.__apiLogs = [];
    window.__consoleLogs = [];

    // Intercept fetch
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const req = args[0];
      const opts = args[1] || {};
      const start = Date.now();
      let res;
      try { res = await origFetch(...args); } catch(e) { throw e; }
      const clone = res.clone();
      let body = null;
      try { body = await clone.json(); } catch(e) { try { body = await clone.text(); } catch(e2) {} }
      window.__apiLogs.push({
        url: typeof req === 'string' ? req : req.url,
        method: (opts.method || 'GET').toUpperCase(),
        requestBody: opts.body ? (() => { try { return JSON.parse(opts.body); } catch(e) { return opts.body; } })() : null,
        requestHeaders: opts.headers || {},
        status: res.status,
        responseBody: body,
        duration: Date.now() - start,
        timestamp: new Date().toISOString()
      });
      return res;
    };

    // Console capture
    ['log','warn','error'].forEach(level => {
      const orig = console[level].bind(console);
      console[level] = function(...args) {
        window.__consoleLogs.push({level, message: args.map(String).join(' '), timestamp: new Date().toISOString()});
        orig(...args);
      };
    });
  }
"
```

### Reading Captured Logs
```bash
LOGS=$($BROWSE js "JSON.stringify(window.__apiLogs)")
echo "$LOGS" > evidence/api-logs/session_logs.json

# Reset for next test
$BROWSE js "window.__apiLogs = []"
```

---

## Session Management

### Login (form mode)
```bash
$BROWSE goto "{login_url}"
$BROWSE snapshot -i -a
# Identify username/password fields from snapshot refs
$BROWSE fill @e_username "{username}"
$BROWSE fill @e_password "{password}"
$BROWSE click @e_submit
$BROWSE wait --networkidle
# Verify login success
TITLE=$($BROWSE js "document.title")
if echo "$TITLE" | grep -qi "login\|sign in"; then
  echo "ERROR: Login failed — still on login page"
  exit 1
fi
```

### Login (cookie mode)
```bash
$BROWSE goto "{app_url}"
$BROWSE js "document.cookie = '{session_cookie}'"
$BROWSE goto "{app_url}"  # Reload with cookie
$BROWSE wait --networkidle
```

### Session Validity Check
Run before each major test phase:
```bash
CURRENT_URL=$($BROWSE js "window.location.href")
if echo "$CURRENT_URL" | grep -qi "login\|signin\|auth"; then
  echo "Session expired — re-logging in"
  # Re-run login sequence
fi
```

### Session Refresh After Rate Limit
```bash
check_rate_limit() {
  LAST_STATUS=$($BROWSE js "window.__apiLogs.slice(-1)[0]?.status || 200")
  if [ "$LAST_STATUS" = "429" ]; then
    echo "Rate limited (429). Waiting before retry..."
    sleep $((2 ** RETRY_COUNT * BASE_DELAY_SECONDS))
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -gt 5 ]; then
      echo "ERROR: Rate limit exceeded after 5 retries"
      return 1
    fi
  fi
  RETRY_COUNT=0
}
```

---

## Role Credentials File

All skills take additional roles from one JSON file, passed as `roles_file=path/to/roles.json`:

```json
{
  "roles": {
    "merchant": { "username": "merchant_qa", "password": "..." },
    "support":  { "username": "support_qa",  "password": "...",
                  "old_username": "support_legacy", "old_password": "..." },
    "readonly": { "username": "viewer_qa",   "password": "...", "expected": "view-only" }
  }
}
```

- `old_username` / `old_password` are used on the legacy system in `/migration-certification`; without them the same
  credentials are used on both systems.
- `expected` (optional) is a short note of what the role should be able to do. Permission tests use it to judge
  results; without it, permission results are recorded as observed (RECORDED) rather than PASS/FAIL.
- The primary `role` / `username` / `password` arguments stay as the baseline role and do not need to be in the file.
- Keep this file outside `certification-runs/`. Never copy it into the session folder, reports, Jira, or logs — refer
  to roles by name only.
- Each role logs in with a fresh browse session (clear cookies, re-login) so sessions never mix.

**Inline alternative.** For a few roles, the same information can be passed inline instead of a file:
```
roles=merchant,support
merchant_username=merchant1 merchant_password=Merch@123
support_username=support1 support_password=Supp@123
support_old_username=support_legacy support_old_password=Old@123
```
The orchestrator turns this into the same `roles` map as the file. Every role named in `roles=` must have a
`{role}_username` and `{role}_password`; otherwise stop with NEEDS_CONTEXT. If both `roles_file` and `roles=` are
given, merge them (inline wins for a role named in both).

---

## Test Delay Protocol

Between test cases, wait `test_delay_ms` (default 500ms) to avoid overwhelming the server:

```bash
TEST_DELAY_MS=${test_delay_ms:-500}
sleep_between_tests() {
  sleep $(echo "scale=3; $TEST_DELAY_MS / 1000" | bc)
}
```

Call `sleep_between_tests` after every form submission or action, before the next test.

---

## Generated Playwright Script Output

At the end of certification, generate `.spec.ts` regression test files. Each file corresponds to one form:

```typescript
// playwright-regression/{form-name}.spec.ts
import { test, expect } from '@playwright/test';

test.describe('{Form Name} — Regression Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('{app_url}');
    await page.fill('[name="username"]', '{username}');
    await page.fill('[name="password"]', '{password}');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('email field: positive valid', async ({ page }) => {
    await page.goto('{form_url}');
    await page.fill('[name="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    await expect(page.locator('.success-message')).toBeVisible();
  });

  test('email field: invalid format rejected', async ({ page }) => {
    await page.goto('{form_url}');
    await page.fill('[name="email"]', 'notanemail');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-message')).toBeVisible();
  });

  // ... one test per test case
});
```

Write one `.spec.ts` file per discovered form into `playwright-regression/`.
These files are standalone — teams can run them with `npx playwright test` in CI without Claude.
