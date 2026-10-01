# Boundary Values — Precise Boundary Test Value Calculation

Apply this reference when a field has explicit min/max constraints. Boundary value analysis is one of the most effective techniques for finding off-by-one errors.

---

## String Length Boundaries

For a field with `min_length = L` and `max_length = H`:

| Test Name | Length | Construction |
|-----------|--------|-------------|
| boundary_under | L - 1 | `"a".repeat(L - 1)` — if L > 0, else skip |
| boundary_min | L | `"a".repeat(L)` |
| boundary_min_plus_one | L + 1 | `"a".repeat(L + 1)` |
| boundary_midpoint | ⌊(L + H) / 2⌋ | `"a".repeat(mid)` |
| boundary_max_minus_one | H - 1 | `"a".repeat(H - 1)` |
| boundary_max | H | `"a".repeat(H)` |
| boundary_over | H + 1 | `"a".repeat(H + 1)` — expected to fail |

**Important:** Use realistic character types for the field type:
- Text: `"A".repeat(N)` (uppercase letter — safe for most validators)
- Email: `"a".repeat(N - 12) + "@example.com"` (valid email at target length)
- Phone: Pad with digits

**Example:** For `business_name` with `min_length=2, max_length=100`:
- boundary_under → `"a"` (length 1) — expected FAIL
- boundary_min → `"Aa"` (length 2) — expected PASS
- boundary_max → `"A".repeat(100)` (length 100) — expected PASS
- boundary_over → `"A".repeat(101)` (length 101) — expected FAIL

---

## Numeric Boundaries

For a field with `min = A` and `max = B` (integer):

| Test Name | Value | Expected |
|-----------|-------|---------|
| boundary_under | A - 1 | FAIL |
| boundary_min | A | PASS |
| boundary_min_plus_one | A + 1 | PASS |
| boundary_midpoint | ⌊(A + B) / 2⌋ | PASS |
| boundary_max_minus_one | B - 1 | PASS |
| boundary_max | B | PASS |
| boundary_over | B + 1 | FAIL |

For float fields, use one unit below the precision level:
- If precision is 2 decimals: unit = 0.01
- boundary_over = B + 0.01

**Example:** For `quantity` with `min=1, max=999`:
- boundary_under → `0` — expected FAIL
- boundary_min → `1` — expected PASS
- boundary_max → `999` — expected PASS
- boundary_over → `1000` — expected FAIL

---

## Date Boundaries

For a date field with `min_date = D1` and `max_date = D2`:

| Test Name | Value | Expected |
|-----------|-------|---------|
| boundary_under | D1 - 1 day | FAIL |
| boundary_min | D1 | PASS |
| boundary_midpoint | midpoint date | PASS |
| boundary_max | D2 | PASS |
| boundary_over | D2 + 1 day | FAIL |

For "future only" date fields (no explicit max, but must be after today):
- boundary_min = today's date
- boundary_under = yesterday's date
- boundary_max = 5 years from today (reasonable upper bound)

For "past only" date fields:
- boundary_max = today's date
- boundary_over = tomorrow's date

---

## Special Boundary Cases

### Zero
For any numeric field that accepts 0 as a valid value, zero is always a boundary:
- Test 0 explicitly in addition to the min/max boundaries

### Null vs Empty String
These are distinct values — always test both:
- Empty string: `""`
- Null: `null` (injected via `browse js "document.querySelector('[name=X]').value = null"`)

### Unicode Boundaries
For text fields without explicit encoding restrictions:
- ASCII limit: character with code 127 (`del` character — may cause issues)
- Unicode: `"こんにちは"` (5 Japanese chars — tests multi-byte handling)
- Emoji: `"🎉"` (4-byte UTF-8 — can break length calculations on some backends)

### SQL/XSS Probe Values (for special_chars tests)
These are NOT security penetration tests — they test input validation correctness:

```
SQL probes (should be escaped/rejected or treated as literal text):
  ' OR '1'='1
  '; DROP TABLE users; --
  1; SELECT * FROM users

XSS probes (should be escaped/rejected):
  <script>alert('xss')</script>
  <img src=x onerror=alert(1)>
  javascript:alert(1)

Path traversal:
  ../../../etc/passwd
  ..\..\Windows\system32

Null byte:
  test\x00injection
```

For each of these, `expected_outcome = "fail"` (app should reject or sanitize).
If the app accepts and displays them unescaped, that is a finding worth reporting — even if this skill is not a security testing tool.

---

## When No min/max Is Known

Use these defaults:

| Field Type | Default min_length | Default max_length |
|------------|-------------------|-------------------|
| text | 1 | 255 |
| email | 5 | 254 |
| password | 8 | 128 |
| textarea | 1 | 5000 |
| tel | 7 | 15 |
| url | 10 | 2048 |
| number (int) | 0 | 2147483647 (int32 max) |
| number (float) | 0.0 | 999999.99 |

Mark any test case using default bounds with `"using_defaults": true` in the test case object.

---

## Generating Precise String Values

When constructing strings of exact lengths, use a consistent character for padding:

```bash
# Shell: generate string of exactly N characters
python3 -c "print('A' * $N)"

# For email at length N (N >= 12):
python3 -c "n=$N; print('a' * (n-12) + '@example.com')"
```

Always verify the generated value's actual length before writing it to the test case.
