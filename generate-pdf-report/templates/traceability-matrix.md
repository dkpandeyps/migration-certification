# Migration Traceability Matrix

{IF NOT migration_run:}

## Not Applicable

This report is only generated for **migration certification** runs (`/migration-certification`).

For single-application certification (`/application-certification`), there is no legacy system to compare against.

To generate a traceability matrix, run:
```
/migration-certification old_url={legacy_url} new_url={new_url} username={user} password={pass} role={role}
```

{ELSE:}

**Legacy System:** {old_url}
**New System:** {new_url}
**Migration Score:** {migration_score}% — {recommendation}
**Generated:** {generated_at}

---

## Migration Score

| Metric | Value |
|--------|-------|
| Total Legacy Features | {total_old_features} |
| Equivalent in New | {equivalent} |
| Changed in New | {changed} |
| Missing in New | {missing} |
| New in New (not in legacy) | {new_in_new} |
| **Migration Score** | **{migration_score}%** |
| **Recommendation** | **{recommendation_with_emoji}** |

---

## Page Traceability

| Legacy URL | Legacy Title | New URL | New Title | Status | Gaps | Legacy Cert | New Cert |
|-----------|-------------|---------|-----------|--------|------|------------|---------|
{page_traceability_rows}

**Status legend:** ✅ Equivalent | ⚠️ Changed | 🔄 Moved | ❌ Missing | 🆕 New

---

## Form Traceability

| Legacy Form | Fields (L) | New Form | Fields (N) | Removed | Added | Changed Fields | Status | Gaps |
|------------|-----------|---------|-----------|---------|-------|---------------|--------|------|
{form_traceability_rows}

---

## Workflow Traceability

| Legacy Workflow | Steps (L) | New Workflow | Steps (N) | Status | Gaps |
|----------------|----------|-------------|----------|--------|------|
{workflow_traceability_rows}

---

## API Traceability

| Method | Legacy Endpoint | New Endpoint | Status | Notes |
|--------|----------------|-------------|--------|-------|
{api_traceability_rows}

---

## Gap Summary

| Gap ID | Type | Severity | Description | Action Required |
|--------|------|---------|-------------|----------------|
{gap_summary_rows}

---

## Conditions for Go-Live

{IF recommendation = HOLD OR PROCEED_WITH_CONDITIONS:}

The following must be resolved before go-live:

{conditions_numbered_list}

{IF recommendation = PROCEED:}
**All legacy features are present and equivalent in the new system. No conditions.**

---

*Source: `{SESSION_DIR}/traceability-matrix.json`*
*Gap details: `{SESSION_DIR}/migration-gap-report.json`*

{END IF migration_run}
