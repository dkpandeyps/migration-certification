---
name: test-data-generator
description: Generates comprehensive test cases for every discovered form field — positive, negative, boundary, and dependency tests. Reads inventory.json and writes test-data/{form-name}.json per form.
version: 1.0.0
preamble-tier: 1
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# /test-data-generator — Field-Level Test Case Generator

> **Path resolution:** relative paths in this skill (`shared/...`, `<skill-name>/references/...`, `<skill-name>/templates/...`)
> are relative to the skills root — the folder that contains this skill's folder (normally `~/.claude/skills/`).
> Read them from there, whatever the current working directory is. `install.ps1` / `install.sh` put `shared/` there.


Reads the `inventory.json` produced by `/discover-app` and generates a full set of test cases for every field in every form. Output is used by `/application-certification` to drive form testing.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `session_path` | Yes* | — | Path to a `certification-runs/{session-id}` directory |
| `inventory_path` | Yes* | — | Direct path to an `inventory.json` file |

*One of `session_path` or `inventory_path` must be provided. If `session_path`, the skill reads `{session_path}/discovery/inventory.json`.

## Example Usage

```
/test-data-generator session_path=./certification-runs/20260611_142200_myapp
/test-data-generator inventory_path=./certification-runs/20260611_142200_myapp/discovery/inventory.json
```

---

## Preamble

```bash
# Resolve inventory path
if [ -n "$session_path" ]; then
  INVENTORY_PATH="$session_path/discovery/inventory.json"
  OUTPUT_DIR="$session_path/test-data"
elif [ -n "$inventory_path" ]; then
  INVENTORY_PATH="$inventory_path"
  OUTPUT_DIR="$(dirname "$(dirname "$inventory_path")")/test-data"
else
  echo "ERROR: Provide session_path or inventory_path"
  exit 1
fi

if [ ! -f "$INVENTORY_PATH" ]; then
  echo "ERROR: inventory.json not found at $INVENTORY_PATH"
  echo "Run /discover-app first."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
echo "Reading inventory: $INVENTORY_PATH"
echo "Writing test data to: $OUTPUT_DIR"
```

---

## Algorithm

1. Read `inventory.json`
2. For each form in `inventory.forms[]`:
   a. For each field in `form.fields[]`:
      - Determine the field's type, constraints, and options
      - Apply the test strategy from `references/field-type-strategies.md`
      - Generate test cases (see test case structure below)
      - Detect cross-field dependencies and generate dependency_violation cases
   b. Write all test cases to `{OUTPUT_DIR}/{form.form_slug}.json`
3. Print summary: total forms processed, total test cases generated

---

## Test Case Structure

Each test case in `{form_slug}.json` follows this structure:

```json
{
  "form_id": "form_001",
  "form_name": "Create Merchant",
  "form_slug": "create_merchant",
  "form_url": "/merchants/create",
  "total_test_cases": 87,
  "test_cases": [
    {
      "test_id": "form_001_field_001_positive_valid",
      "form_id": "form_001",
      "field_id": "field_001",
      "field_name": "business_name",
      "field_label": "Business Name",
      "test_type": "positive_valid | negative_blank | negative_invalid_format | negative_invalid_value | boundary_min | boundary_max | boundary_over | boundary_under | special_chars | dependency_violation",
      "description": "Valid business name within allowed length",
      "fill_instructions": {
        "target_field": "field_001",
        "value": "Acme Corporation Ltd",
        "other_fields": {
          "field_002": "admin@acme.com",
          "field_003": "IN"
        }
      },
      "expected_outcome": "pass | fail",
      "expected_error_message": null,
      "expected_error_contains": null
    },
    {
      "test_id": "form_001_field_001_negative_blank",
      "field_id": "field_001",
      "field_name": "business_name",
      "test_type": "negative_blank",
      "description": "Submit with business_name empty — required field should reject",
      "fill_instructions": {
        "target_field": "field_001",
        "value": "",
        "other_fields": {
          "field_002": "admin@acme.com",
          "field_003": "IN"
        }
      },
      "expected_outcome": "fail",
      "expected_error_contains": ["required", "cannot be empty", "is required"]
    }
  ]
}
```

---

## Cross-Field Setup (fill_instructions.other_fields)

For every test case, `other_fields` contains valid values for all OTHER required fields.
This ensures only the target field's validation is being tested.

Algorithm for generating `other_fields`:
1. Find all required fields in the same form
2. Generate a `positive_valid` value for each (using field-type-strategies.md)
3. Apply dependency ordering (fill `depends_on` fields before their dependents)
4. Set `other_fields` to this complete map, excluding the target field

---

## Dependency Violation Test Cases

For each field where `depends_on` is set:
1. Generate a test case where the dependent field is filled but the parent field is in an invalid state
2. Set `test_type = "dependency_violation"`
3. `expected_outcome = "fail"`

For each field where `dependency_of` is set (it controls another field's visibility):
1. Test the scenario where the dependent field appears (set parent to triggering value)
2. Test the scenario where the dependent field is hidden (set parent to non-triggering value)

---

## Output Summary

After processing all forms, print:

```
Test data generation complete.
Forms processed: 8
Total test cases: 347
Output directory: {OUTPUT_DIR}

Per-form breakdown:
  create_merchant.json     → 87 test cases (12 fields × avg 7.25 per field)
  edit_merchant.json       → 72 test cases
  ...
```

---

## Completion Status

- **DONE** — All forms processed, test data written
- **DONE_WITH_CONCERNS** — Some fields had unknown types and only partial test cases were generated (list them)
- **BLOCKED** — inventory.json not found
- **NEEDS_CONTEXT** — inventory.json is empty (discovery may have failed)
