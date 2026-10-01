---
name: generate-jira-bugs
description: Converts certification defects into Jira-ready format. Export mode always runs (produces jira-bugs.json and jira-bugs.csv). Live push mode activates when JIRA_URL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY environment variables are set.
version: 1.0.0
preamble-tier: 1
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# /generate-jira-bugs — Jira Defect Export and Push

> **Path resolution:** relative paths in this skill (`shared/...`, `<skill-name>/references/...`, `<skill-name>/templates/...`)
> are relative to the skills root — the folder that contains this skill's folder (normally `~/.claude/skills/`).
> Read them from there, whatever the current working directory is. `install.ps1` / `install.sh` put `shared/` there.


Reads `defects.json` from a certification session and produces Jira-ready output. Always generates local artifacts; optionally pushes to Jira if credentials are configured.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `session_path` | Yes* | — | Path to a `certification-runs/{id}` directory |
| `defects_path` | Yes* | — | Direct path to a `defects.json` file |
| `jira_url` | No | `$JIRA_URL` | Jira instance base URL |
| `jira_api_token` | No | `$JIRA_API_TOKEN` | Jira API token (base64 user:token) |
| `jira_project_key` | No | `$JIRA_PROJECT_KEY` | Jira project key (e.g., CERT) |
| `jira_issue_type` | No | `Bug` | Issue type name |
| `jira_labels` | No | `certification,auto-generated` | Comma-separated labels |
| `min_severity` | No | `low` | Only export defects at this severity or above (`critical`, `high`, `medium`, `low`) |

*One of `session_path` or `defects_path` must be provided.

## Example Usage

```
/generate-jira-bugs session_path=./certification-runs/20260611_142200_myapp
/generate-jira-bugs session_path=./certification-runs/20260611_142200_myapp min_severity=high
/generate-jira-bugs session_path=./certification-runs/20260611_142200_myapp jira_url=https://myorg.atlassian.net jira_api_token=dXNlcjp0b2tlbg== jira_project_key=CERT
```

---

## Preamble

```bash
# Resolve defects path
if [ -n "$session_path" ]; then
  DEFECTS_PATH="$session_path/defects/defects.json"
  OUTPUT_DIR="$session_path/defects"
elif [ -n "$defects_path" ]; then
  DEFECTS_PATH="$defects_path"
  OUTPUT_DIR="$(dirname "$defects_path")"
fi

if [ ! -f "$DEFECTS_PATH" ]; then
  echo "ERROR: defects.json not found at $DEFECTS_PATH"
  exit 1
fi

# Detect Jira mode
JIRA_URL_RESOLVED="${jira_url:-$JIRA_URL}"
JIRA_TOKEN_RESOLVED="${jira_api_token:-$JIRA_API_TOKEN}"
JIRA_PROJECT_RESOLVED="${jira_project_key:-$JIRA_PROJECT_KEY}"

JIRA_MODE="export"
if [ -n "$JIRA_URL_RESOLVED" ] && [ -n "$JIRA_TOKEN_RESOLVED" ] && [ -n "$JIRA_PROJECT_RESOLVED" ]; then
  JIRA_MODE="live_push"
fi

echo "Mode: $JIRA_MODE"
echo "Defects: $DEFECTS_PATH"
echo "Output: $OUTPUT_DIR"

# Severity filter
MIN_SEVERITY="${min_severity:-low}"
```

---

## Phase 1 — Read and Filter Defects

Read `defects.json`. Apply severity filter:

```bash
SEVERITY_ORDER=("critical" "high" "medium" "low")
# Include defects at MIN_SEVERITY and above
```

Print: `Found N defects (after severity filter: N)`

---

## Phase 2 — Generate Jira-Shaped Objects

For each defect in the filtered list, create a Jira issue object using the template in `templates/jira-bug-template.json`.

**Mapping rules:**

| Defect Field | Jira Field |
|-------------|-----------|
| `title` | `summary` |
| `severity` → priority | Critical→Critical, High→High, Medium→Medium, Low→Low |
| `module` | Prepended to summary: `"[{module}] {title}"` |
| `environment` | `environment` |
| `steps_to_reproduce` | ADF ordered list in description |
| `expected_result` | ADF heading + paragraph in description |
| `actual_result` | ADF heading + paragraph in description |
| `evidence_screenshots` | listed in description + uploaded as attachments in live mode |
| `defect.id` | Added as label: `defect-id-{id}` |

**Priority mapping:**

| Defect Severity | Jira Priority |
|----------------|--------------|
| critical | Critical |
| high | High |
| medium | Medium |
| low | Low |

---

## Phase 3 — Export Mode (Always Runs)

### Write jira-bugs.json

Array of all Jira-shaped issue objects:

```json
[
  {
    "defect_id": "DEF_001",
    "summary": "[Merchant Registration] Email field accepts invalid format 'notanemail'",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "**Environment:** https://app.example.com"}]},
        {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Steps to Reproduce"}]},
        {"type": "orderedList", "content": [
          {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Navigate to /merchants/create"}]}]},
          {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Enter 'notanemail' in the Email field"}]}]},
          {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Click Submit"}]}]}
        ]},
        {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Expected Result"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "Validation error shown: 'Please enter a valid email address'"}]},
        {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Actual Result"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "Form submitted successfully with invalid email — no validation error shown"}]}
      ]
    },
    "issuetype": {"name": "Bug"},
    "priority": {"name": "Critical"},
    "labels": ["certification", "auto-generated", "defect-id-DEF_001"],
    "environment": "https://app.example.com",
    "attachments": ["evidence/screenshots/20260611_152300_DEF_001_before.png"]
  }
]
```

Write to: `{OUTPUT_DIR}/jira-bugs.json`

### Write jira-bugs.csv

Write CSV with columns from `templates/csv-columns.md`.

Write to: `{OUTPUT_DIR}/jira-bugs.csv`

---

## Phase 4 — Live Push Mode (Only When Jira Configured)

For each bug in `jira-bugs.json`:

### Create Issue

```bash
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Basic $JIRA_TOKEN_RESOLVED" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  "$JIRA_URL_RESOLVED/rest/api/3/issue" \
  -d "{
    \"fields\": {
      \"project\": {\"key\": \"$JIRA_PROJECT_RESOLVED\"},
      \"summary\": \"$SUMMARY\",
      \"description\": $DESCRIPTION_ADF,
      \"issuetype\": {\"name\": \"$ISSUE_TYPE\"},
      \"priority\": {\"name\": \"$PRIORITY\"},
      \"labels\": $LABELS_ARRAY,
      \"environment\": \"$ENVIRONMENT\"
    }
  }")

ISSUE_KEY=$(echo "$RESPONSE" | jq -r '.key')
ISSUE_ID=$(echo "$RESPONSE" | jq -r '.id')

if [ "$ISSUE_KEY" = "null" ] || [ -z "$ISSUE_KEY" ]; then
  echo "ERROR creating issue: $(echo $RESPONSE | jq -r '.errors // .errorMessages')"
  continue
fi
echo "Created: $ISSUE_KEY"
```

### Upload Attachments

```bash
for SCREENSHOT in $ATTACHMENTS; do
  if [ -f "$session_path/$SCREENSHOT" ]; then
    curl -s -X POST \
      -H "Authorization: Basic $JIRA_TOKEN_RESOLVED" \
      -H "X-Atlassian-Token: no-check" \
      -F "file=@$session_path/$SCREENSHOT" \
      "$JIRA_URL_RESOLVED/rest/api/3/issue/$ISSUE_KEY/attachments"
  fi
done
```

### Handle Errors

- **401:** Invalid credentials → BLOCKED with message "Jira authentication failed. Check JIRA_API_TOKEN."
- **403:** Insufficient permissions → BLOCKED with message "Account lacks permission to create issues in project $JIRA_PROJECT_RESOLVED."
- **429:** Rate limited → wait 60 seconds, retry once
- **400:** Validation error → log the error, skip this issue, continue with others

### Write jira-issue-keys.json

```json
{
  "session_id": "...",
  "project": "CERT",
  "created_at": "2026-06-11T19:00:00Z",
  "issues": [
    {"defect_id": "DEF_001", "jira_key": "CERT-123", "jira_url": "https://myorg.atlassian.net/browse/CERT-123", "status": "created"},
    {"defect_id": "DEF_002", "jira_key": null, "error": "400: Field 'priority' value 'Critical' is not valid", "status": "failed"}
  ],
  "summary": {
    "total": 3,
    "created": 2,
    "failed": 1
  }
}
```

---

## Final Output

**Export mode:**
```
Jira export complete (export mode — no Jira credentials configured).
Defects exported: 3
Output:
  jira-bugs.json  → {OUTPUT_DIR}/jira-bugs.json
  jira-bugs.csv   → {OUTPUT_DIR}/jira-bugs.csv

To push to Jira, set: JIRA_URL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
```

**Live push mode:**
```
Jira push complete.
Issues created: 2/3
Issues failed: 1 (see jira-issue-keys.json for details)
Project: https://myorg.atlassian.net/projects/CERT
Output: {OUTPUT_DIR}/jira-issue-keys.json
```

---

## Completion Status

- **DONE** — All defects exported/pushed
- **DONE_WITH_CONCERNS** — Some issues failed to create (list them)
- **BLOCKED** — Jira authentication failed or defects.json not found
