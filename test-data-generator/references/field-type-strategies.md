# Field Type Strategies — Test Value Generation Per Field Type

For every field type, this table defines what values to generate for each test category.
Use `boundary-values.md` for precise boundary calculations when min/max are known.

---

## text (generic text input)

| Test Type | Value to Use |
|-----------|-------------|
| positive_valid | `"Test Value One"` (valid, mid-length, ASCII-safe) |
| negative_blank | `""` (empty string) |
| negative_invalid_format | N/A — text accepts anything; skip if no pattern constraint |
| negative_invalid_value | If pattern is set: `"!!!invalid!!!"` (fails pattern) |
| boundary_min | String of exactly `min_length` chars (if set), else `"a"` |
| boundary_max | String of exactly `max_length` chars (if set), else 255-char string |
| boundary_over | String of `max_length + 1` chars |
| boundary_under | String of `min_length - 1` chars (if min_length > 0), else `""` |
| special_chars | `"<script>alert('xss')</script>"` |
| dependency_violation | Not applicable unless `depends_on` is set |

---

## email

| Test Type | Value |
|-----------|-------|
| positive_valid | `"testuser@example.com"` |
| negative_blank | `""` |
| negative_invalid_format | `"notanemail"` |
| negative_invalid_format_2 | `"missing@domain"` |
| negative_invalid_format_3 | `"@nodomain.com"` |
| negative_invalid_format_4 | `"spaces in@email.com"` |
| boundary_max | `"a".repeat(243) + "@example.com"` (254 chars, RFC 5321 max) |
| boundary_over | `"a".repeat(244) + "@example.com"` (255 chars — over limit) |
| special_chars | `"test+tag@example.com"` (valid plus address — some apps reject) |

---

## password

| Test Type | Value |
|-----------|-------|
| positive_valid | `"TestPass123!"` (uppercase + lowercase + digit + special) |
| negative_blank | `""` |
| negative_too_short | `"Ab1!"` (4 chars — typically below minimum) |
| negative_no_uppercase | `"testpass123!"` |
| negative_no_digit | `"TestPassword!"` |
| negative_no_special | `"TestPassword123"` |
| boundary_min | String meeting minimum length exactly |
| boundary_max | String at maximum length (if set) |
| boundary_over | String 1 char over maximum |
| special_chars | `"<>'\"& pass"` (HTML special chars in password) |

---

## number (integer or float)

| Test Type | Value |
|-----------|-------|
| positive_valid | Midpoint of min and max (or `42` if no constraints) |
| negative_blank | `""` |
| negative_invalid_format | `"abc"` |
| negative_invalid_format_2 | `"12.34"` (decimal for integer field) |
| negative_invalid_format_3 | `"1e5"` (scientific notation) |
| boundary_min | Exact minimum value (or `0`) |
| boundary_max | Exact maximum value (or `9999999`) |
| boundary_under | `min - 1` |
| boundary_over | `max + 1` |
| special_chars | `"-1"` (negative when only positive allowed) |

---

## date (input type=date, value format YYYY-MM-DD)

| Test Type | Value |
|-----------|-------|
| positive_valid | Today's date `2026-06-11` |
| negative_blank | `""` |
| negative_invalid_format | `"31/12/2026"` (wrong format) |
| negative_invalid_format_2 | `"2026-13-01"` (month 13) |
| negative_invalid_format_3 | `"not-a-date"` |
| boundary_min | One day after the minimum allowed date (or `1970-01-01`) |
| boundary_max | One day before the maximum allowed date (or `2099-12-31`) |
| boundary_under | One day before the minimum (or `1969-12-31`) |
| boundary_over | One day after the maximum |
| special_chars | `"2026-06-'; DROP TABLE--"` |

---

## datetime / datetime-local

Same as date but append `T00:00` for valid format. Invalid: `"2026-06-11"` (missing time).

---

## select (dropdown)

| Test Type | Value |
|-----------|-------|
| positive_valid | First non-empty option's value |
| negative_blank | `""` (empty/placeholder option) |
| negative_invalid_value | A value not in the options list (injected via JS: `browse js "document.querySelector('select[name=X]').value = 'INVALID_99'"`) |
| boundary_min | N/A |
| boundary_max | N/A |
| special_chars | Option containing HTML (most apps won't have this but test injection) |

---

## multiselect

| Test Type | Value |
|-----------|-------|
| positive_valid | Select 2-3 valid options |
| negative_blank | Select nothing (if required) |
| boundary_max | Select all available options |
| negative_invalid_value | Inject an invalid option value via JS |

---

## checkbox

| Test Type | Value |
|-----------|-------|
| positive_valid | `checked = true` |
| negative_blank | `checked = false` (if required, this should fail) |

---

## radio (group)

| Test Type | Value |
|-----------|-------|
| positive_valid | First option selected |
| negative_blank | No option selected (if required) |
| boundary_last | Last option selected |

---

## file upload

| Test Type | Value | File to Use |
|-----------|-------|-------------|
| positive_valid | Valid file matching accepted MIME types | `/tmp/test-doc.pdf` (100KB PDF) |
| negative_blank | No file selected (if required) | — |
| negative_wrong_type | File with wrong extension | `/tmp/test.exe` (if PDF required) |
| negative_oversized | File exceeding max size | `/tmp/large-file.bin` (10MB) |
| negative_zero_bytes | Empty file | `/tmp/empty.pdf` |

**Create test files before testing:**
```bash
# Create test PDF (minimal valid PDF)
printf '%s' '%PDF-1.4 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n trailer<</Size 4/Root 1 0 R>>startxref 174 %%EOF' > /tmp/test-doc.pdf

# Create oversized file
dd if=/dev/urandom of=/tmp/large-file.bin bs=1M count=10 2>/dev/null

# Create wrong type
echo "This is not a PDF" > /tmp/test.txt
```

---

## textarea

Same as `text` but:
- `positive_valid`: Multi-line text with 3-5 sentences
- `boundary_max`: Fill to `max_length` characters (if set)
- `special_chars`: Include HTML tags, newlines, unicode: `"Line 1\nLine 2\n<b>bold</b>\néà"`

---

## tel (phone number)

| Test Type | Value |
|-----------|-------|
| positive_valid | `"+1-800-555-0100"` |
| negative_blank | `""` |
| negative_invalid_format | `"abcdefgh"` |
| negative_too_short | `"123"` |
| negative_invalid_chars | `"123-456-78!0"` |
| boundary_min | 7-digit number: `"5550100"` |
| boundary_max | 15-digit E.164: `"+999999999999999"` |

---

## url

| Test Type | Value |
|-----------|-------|
| positive_valid | `"https://www.example.com"` |
| negative_blank | `""` |
| negative_no_protocol | `"www.example.com"` |
| negative_invalid | `"not a url"` |
| negative_ftp | `"ftp://files.example.com"` (may be rejected) |
| special_chars | `"javascript:alert(1)"` |

---

## Unknown / Custom Field Types

If the field type is not recognized:
1. Generate `positive_valid` with the current default value or placeholder text
2. Generate `negative_blank` (empty string)
3. Generate `special_chars` (`<script>alert(1)</script>`)
4. Mark the test cases with `"confidence": "low"` and note the unknown type
5. Report the unknown field type in DONE_WITH_CONCERNS
