# Enterprise Certification Framework for Claude Code

A complete Claude Code skill ecosystem for enterprise-grade application certification, migration validation, and production readiness assessment. Dynamically discovers every page, form, field, workflow, permission, and API endpoint — no hardcoded modules.

**Works with any web application.** Nothing is tied to a specific product, page, or login: point it at any URL (a whole app or a
single page with `scope=`), give it any credentials (one role or many), and it discovers and tests what it finds. For a migration,
give it the legacy URL and the new URL — they can be completely different apps, hosts, or URL structures.

---

## Prerequisites

- [Claude Code](https://claude.com/claude-code) (CLI, desktop, or IDE extension)
- git, [bun](https://bun.sh) 1.3+, Node.js 18+
- **paysec** toolkit at `~/.claude/skills/paysec` — provides the `browse` binary (headless Chromium the skills drive),
  `/md-to-pdf` (PDF reports), and the review skills `/qa-report`, `/plan-tech-review`, `/plan-business-review`
- Optional: Jira API access for live bug push

Install paysec and verify the browse binary:
```bash
git clone https://github.com/dkpandeyps/paysec.git ~/.claude/skills/paysec
cd ~/.claude/skills/paysec && ./setup
~/.claude/skills/paysec/browser/dist/browse status      # browse.exe on Windows
```

---

## Installation

```bash
git clone https://github.com/dkpandeyps/migration-certification.git
cd migration-certification
```

**Windows (PowerShell):**
```powershell
.\install.ps1
```

**macOS / Linux / Git Bash:**
```bash
./install.sh
```

This copies the 7 skills and the `shared/` reference docs into `~/.claude/skills/`. Restart Claude Code (or run `/reload`)
and the skills are available as slash commands from any project. To update later: `git pull` and run the installer again.

### Repository layout

```
├── discover-app/                 /discover-app — crawls the app, builds inventory.json
├── test-data-generator/          /test-data-generator — test cases for every field
├── application-certification/    /application-certification — full single-app certification (orchestrator)
├── migration-certification/      /migration-certification — legacy vs new, 5-layer comparison, --full mode
├── production-readiness-review/  /production-readiness-review — 10-gate PASS/FAIL
├── generate-jira-bugs/           /generate-jira-bugs — Jira JSON/CSV export + optional live push
├── generate-pdf-report/          /generate-pdf-report — 7 PDF reports + test-case register script
├── shared/                       reference docs used by every skill (browser, discovery, coverage, evidence, schemas)
├── install.ps1 / install.sh      installers
└── Enterprise-Certification-Framework-User-Guide.md/.pdf   full user guide
```

### Providing logins

- Primary login: `username=... password=... role=...` on the command line.
- More roles: a `roles.json` file passed as `roles_file=path` (format in `shared/browse-integration.md → Role Credentials File`),
  or inline `roles=merchant,support merchant_username=... merchant_password=...`.
- SSO / MFA / CAPTCHA: log in once in your browser and pass `login_mode=cookie session_cookie="..."`.
- Keep `roles.json` outside the repo; `.gitignore` excludes `roles*.json` and `certification-runs/` (run output) anyway.

---

## Quick Start

### Certify a single application
```
/application-certification url=https://app.example.com username=admin password=secret role=admin
```

### Certify with full reports, Jira push, and paysec review
```
/application-certification url=https://app.example.com username=admin password=secret role=admin --final
```

### Certify a migration (legacy vs new)
```
/migration-certification old_url=https://legacy.example.com new_url=https://new.example.com username=admin password=secret role=admin
```

### Check production readiness from an existing session
```
/production-readiness-review session_path=./certification-runs/20260611_142200_myapp
```

---

## Skill Reference

| Skill | Purpose | Key Inputs | Key Outputs |
|-------|---------|-----------|------------|
| `/discover-app` | BFS crawl — discovers all pages, forms, fields, tables, APIs | url, username, password | inventory.json, coverage-map.json, screenshots |
| `/test-data-generator` | Generates test cases per field (positive/negative/boundary/dependency) | session_path | test-data/{form}.json |
| `/application-certification` | Full cert — orchestrates all phases, generates verdict | url, username, password, role | certification-result.json, coverage/, defects/, playwright-regression/ |
| `/migration-certification` | Fully certifies legacy and new (every role), then compares — gaps, 5-layer behavioral diff incl. permission parity, traceability | old_url, new_url, username, password, role, roles_file, scope, --full | migration-gap-report.json, traceability-matrix.json, migration-score.json |
| `/production-readiness-review` | Go/no-go gate evaluation — binary PASS/FAIL | session_path | production-readiness-result.json |
| `/generate-jira-bugs` | Converts defects to Jira format; optionally pushes via API | session_path | jira-bugs.json, jira-bugs.csv, jira-issue-keys.json |
| `/generate-pdf-report` | Generates 7 reports (PDF primary, HTML fallback), including a Test Case Register listing every test case with its result | session_path | executive-summary, functional-testing, defect-report, traceability-matrix, coverage-report, production-readiness, test-case-register |

---

## Usage Examples

### 1. Quick certification run (no reports, no paysec review)
```
/application-certification url=https://staging.myapp.com username=testadmin password=TestPass123 role=admin --quick
```
Use this during development iterations to check coverage without the full review overhead.

### 2. Final go-live certification (full review + PDFs + Jira)
```
/application-certification url=https://staging.myapp.com username=testadmin password=TestPass123 role=admin --final
```
Runs all 12 phases including the paysec review layer (`/qa-report`, `/plan-tech-review`, `/plan-business-review`), Jira push (if configured), and all 7 PDF reports.

### 3. Multi-role certification
```
/application-certification url=https://staging.myapp.com username=admin password=secret role=admin roles_file=D:/secure/roles.json --final
```
Tests the primary admin role and every role in `roles.json`, and builds a permission matrix across them. Inline `roles=merchant,support merchant_username=.. merchant_password=..` also works.

### 4. Dry-run (skip all destructive tests)
```
/application-certification url=https://shared-staging.myapp.com username=admin password=secret role=admin dry_run=true
```
Use against shared staging environments to avoid polluting test data.

### 5. SSO / pre-authenticated login
```
/discover-app url=https://app.myapp.com login_mode=cookie session_cookie="sessionid=abc123; csrftoken=xyz"
```
Log in manually once, copy the session cookie from browser DevTools, and pass it as `session_cookie`.

### 6. Migration certification with separate credentials per system
```
/migration-certification old_url=https://legacy.myapp.com new_url=https://new.myapp.com username=admin password=newpass old_username=admin old_password=oldpass role=admin
```

### 7. Full migration certification (both systems, every role, nothing skipped)
```
/migration-certification old_url=https://legacy.myapp.com/admin/banks new_url=https://new.myapp.com/banks old_scope=/admin/banks new_scope=/banks username=admin password=secret role=admin roles_file=D:/secure/roles.json shared_db=true --full
```
`roles.json` holds each extra role's login (format in `shared/browse-integration.md → Role Credentials File`).
`--full` refuses to run without it (or without confirmation that there is only one role), refuses `dry_run=true`,
and will not produce a migration score unless both systems pass the completeness check.

### 8. Generate reports from existing session
```
/generate-pdf-report session_path=./certification-runs/20260611_142200_staging_myapp_com
```

---

## Environment Variables (for Jira integration)

```bash
# Set in your shell or .env file
export JIRA_URL="https://yourorg.atlassian.net"
export JIRA_API_TOKEN="dXNlckBlbWFpbC5jb206YXBpdG9rZW4="   # base64(email:api_token)
export JIRA_PROJECT_KEY="CERT"
export JIRA_ISSUE_TYPE="Bug"                                  # Optional, default: Bug
export JIRA_LABELS="certification,auto-generated"             # Optional
```

Generate a Jira API token at: https://id.atlassian.com/manage-profile/security/api-tokens

---

## Session Artifact Structure

Every run creates a timestamped directory:
```
certification-runs/
└── 20260611_142200_staging_myapp_com/
    ├── checkpoint.json          ← Resume state
    ├── discovery/               ← inventory.json, coverage-map.json, screenshots
    ├── test-data/               ← Generated test cases per form
    ├── test-results/            ← Form, CRUD, workflow, permission results
    ├── playwright-regression/   ← Generated .spec.ts files for CI
    ├── evidence/                ← Screenshots, API logs, console logs
    ├── defects/                 ← defects.json, jira-bugs.csv, jira-bugs.json
    ├── coverage/                ← 7 coverage dimension files (incl. ui-ux-coverage.json)
    ├── reports/                 ← 7 PDF/HTML reports (incl. test-case-register)
    └── certification-result.json
```

---

## Known Limitations

1. **SPA router detection** — JS router introspection covers React Router, Vue Router, and Angular Router. Custom or non-standard routers may require `login_mode=script` with manual nav instructions.
2. **MFA / CAPTCHA** — Cannot be automated. Use `login_mode=cookie` with a pre-authenticated session.
3. **Large apps (500+ pages)** — Sub-agent orchestration handles context limits, but runs may take 2–4 hours. Use `--quick` for intermediate runs.
4. **PDF styling** — Reports use minimal styling via paysec `/md-to-pdf`. Full-branded PDF templates require customization of the `templates/` files.
5. **This is functional testing only** — Not a penetration test. Security testing (exploitation, auth bypass probing) requires dedicated security tools.
6. **Shared environments** — Use `dry_run=true` on shared staging environments. Destructive tests (Delete, Approve, Reject) require isolated test environments.

---

## Residual Risk Statement

This framework maximizes coverage but cannot guarantee 100% defect discovery. Every run produces an explicit list of what was covered, what was not, and what residual risks remain. A PASS verdict means all testable surface area was covered — not that the application is perfect.
