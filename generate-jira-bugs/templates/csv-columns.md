# Jira CSV Column Definitions

The `jira-bugs.csv` file is importable directly into Jira via the CSV importer.

---

## Column Order

```
Issue Type,Summary,Priority,Labels,Environment,Description,Steps to Reproduce,Expected Result,Actual Result,Defect ID,Session ID
```

---

## Column Definitions

| Column | Jira Field | Notes |
|--------|-----------|-------|
| `Issue Type` | Issue Type | Always `Bug` |
| `Summary` | Summary | Format: `[{Module}] {Title}` — max 255 chars |
| `Priority` | Priority | `Critical`, `High`, `Medium`, or `Low` |
| `Labels` | Labels | Semicolon-separated: `certification;auto-generated;defect-id-DEF_001` |
| `Environment` | Environment | The application URL where the defect was found |
| `Description` | Description | Full defect description in plain text (no HTML) |
| `Steps to Reproduce` | Custom or Description continuation | Numbered steps, semicolon-separated |
| `Expected Result` | Custom or part of Description | One sentence |
| `Actual Result` | Custom or part of Description | One sentence |
| `Defect ID` | Custom field or Label | The internal defect ID (DEF_001, etc.) |
| `Session ID` | Custom field or Label | The certification session ID for traceability |

---

## CSV Escaping Rules

1. **Enclose all fields in double quotes:** `"value"`
2. **Escape internal double quotes by doubling them:** `"He said ""hello"""` → He said "hello"
3. **Line breaks within a field:** Use `\n` (literal backslash-n) or replace with ` | ` separator
4. **Commas within a field:** Already handled by enclosing in double quotes
5. **Semicolons in labels:** Jira CSV importer uses semicolons to separate multi-value label fields

---

## Example Row

```csv
"Bug","[Merchant Registration] Email field accepts invalid format 'notanemail'","Critical","certification;auto-generated;defect-id-DEF_001","https://app.example.com","Email validation does not reject clearly invalid email addresses, allowing form submission with invalid data.","1. Navigate to /merchants/create;2. Enter 'notanemail' in the Email field;3. Click Submit","Validation error shown: 'Please enter a valid email address'","Form submitted successfully with invalid email — no validation error shown","DEF_001","20260611_142200_myapp"
```

---

## Complete Header Row

```
"Issue Type","Summary","Priority","Labels","Environment","Description","Steps to Reproduce","Expected Result","Actual Result","Defect ID","Session ID"
```

---

## Jira CSV Import Settings

When importing in Jira (Projects → Import Issues → CSV):
- **Delimiter:** Comma
- **Date format:** Leave as default
- **Field mapping:** Map each column to the corresponding Jira field
- **Labels field:** Set to "comma-separated" OR if using semicolons, set the label delimiter to semicolon
- **Existing issue handling:** "Create new issue" for all rows
