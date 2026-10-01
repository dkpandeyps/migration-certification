#!/usr/bin/env bun
/**
 * build-test-register — list EVERY executed test case (pass, fail, skipped) from a certification
 * session as Markdown, ready for paysec md-to-pdf.
 *
 * Usage:  bun build-test-register.ts <session_path> [output.md]
 *         (default output: <session_path>/reports/test-case-register.md)
 *
 * Works for:
 *   - single-app runs   (<session>/test-results/**.json)
 *   - migration runs     (<session>/old/test-results/**.json + <session>/new/test-results/**.json)
 * and tolerates both the framework's standard result schemas (form, CRUD, workflow, UI/UX,
 * permission) and hand-written results ({test_id, form, type, action, expected, result, evidence}).
 *
 * Deterministic: the same session always produces the same register. Nothing is summarised away.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, relative, basename } from "path";

type Result = "PASS" | "FAIL" | "SKIPPED" | "RECORDED" | "UNKNOWN";  // RECORDED = outcome observed, no expected value given
interface Row {
  category: "Form / field" | "CRUD" | "Workflow" | "UI/UX" | "Permission" | "Other";
  id: string; module: string; target: string; type: string;
  input: string; expected: string; actual: string; result: Result; evidence: string;
  source: string;
}

const MAX_CELL = 180;
const session = process.argv[2];
if (!session || !existsSync(session)) {
  console.error("usage: bun build-test-register.ts <session_path> [output.md]");
  process.exit(2);
}
const out = process.argv[3] ?? join(session, "reports", "test-case-register.md");

// ── helpers ──────────────────────────────────────────────────────────────────
const s = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(s).filter(Boolean).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};
const cell = (v: unknown): string => {
  let t = s(v).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  if (t.length > MAX_CELL) t = t.slice(0, MAX_CELL - 1) + "…";
  return t || "—";
};
const first = (o: any, ...keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
function toResult(o: any): Result {
  if (o?.skipped === true || o?.applicable === false || /skip/i.test(s(o?.status ?? o?.result))) return "SKIPPED";
  if (typeof o?.passed === "boolean") return o.passed ? "PASS" : "FAIL";
  if (typeof o?.overall_passed === "boolean") return o.overall_passed ? "PASS" : "FAIL";
  const r = s(first(o, "result", "status", "outcome")).toLowerCase();
  if (/^(pass|passed|ok|success|✅)/.test(r)) return "PASS";
  if (/^(fail|failed|error|defect|bug|❌)/.test(r) || /bypass|regression/.test(r)) return "FAIL";
  return "UNKNOWN";
}
const badge = (r: Result) => ({ PASS: "✅ PASS", FAIL: "❌ FAIL", SKIPPED: "⏭️ SKIPPED", RECORDED: "ℹ️ RECORDED", UNKNOWN: "❔ UNKNOWN" }[r]);
// Permission rows are judged only when the result file says what was expected (passed / expected_allowed).
function permResult(x: any): Result {
  if (typeof x?.passed === "boolean") return x.passed ? "PASS" : "FAIL";
  const exp = x?.expected_allowed ?? x?.expected_accessible;
  const got = x?.allowed ?? x?.accessible;
  if (typeof exp === "boolean" && typeof got === "boolean") return exp === got ? "PASS" : "FAIL";
  return got === undefined ? "UNKNOWN" : "RECORDED";
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const outFiles: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) outFiles.push(...jsonFiles(p));
    else if (e.endsWith(".json")) outFiles.push(p);
  }
  return outFiles.sort();
}

// form/field names from inventory (optional)
function inventoryNames(root: string) {
  const forms = new Map<string, string>(), fields = new Map<string, string>(), tables = new Map<string, string>();
  const inv = join(root, "discovery", "inventory.json");
  if (existsSync(inv)) {
    try {
      const d = JSON.parse(readFileSync(inv, "utf-8"));
      // only index entries that have an id — a missing id must never match a missing lookup key
      for (const f of d.forms ?? []) {
        if (f?.id) forms.set(f.id, f.form_name ?? f.id);
        for (const fl of f?.fields ?? []) if (fl?.id) fields.set(fl.id, fl.field_label ?? fl.field_name ?? fl.id);
      }
      for (const t of d.tables ?? []) if (t?.id) tables.set(t.id, t.table_name ?? t.id);
    } catch { /* inventory optional */ }
  }
  return { forms, fields, tables };
}

// ── parse one side (a directory that contains test-results/) ────────────────
function collect(root: string): Row[] {
  const rows: Row[] = [];
  const names = inventoryNames(root);
  for (const file of jsonFiles(join(root, "test-results"))) {
    let d: any;
    try { d = JSON.parse(readFileSync(file, "utf-8")); } catch { continue; }
    const src = relative(root, file).replace(/\\/g, "/");
    const docs = Array.isArray(d) ? [{ test_cases: d }] : [d];
    for (const doc of docs) {
      // UI/UX: { checks: { name: {passed,...} } }
      if (doc.checks && typeof doc.checks === "object" && !Array.isArray(doc.checks)) {
        const mod = doc.form_name ?? names.forms.get(doc.form_id) ?? doc.form_slug ?? doc.form_id ?? basename(file);
        for (const [check, v] of Object.entries<any>(doc.checks)) {
          const details = Object.entries(v ?? {}).filter(([k]) => k !== "passed").map(([k, x]) => `${k}=${s(x)}`).join("; ");
          rows.push({ category: "UI/UX", id: `${doc.form_slug ?? doc.form_id ?? "form"}:${check}`, module: s(mod),
            target: check, type: "ui_ux_check", input: "", expected: "check passes", actual: details,
            result: toResult(v), evidence: s(doc.evidence_screenshots), source: src });
        }
        continue;
      }
      // Workflow: { success_path, failure_path }
      if (doc.success_path || doc.failure_path) {
        for (const [path, v] of [["success path", doc.success_path], ["failure path", doc.failure_path]] as const) {
          if (!v) continue;
          const actual = path === "success path"
            ? `terminal state: ${s(v.terminal_state_reached)}${v.audit_log_verified !== undefined ? `; audit log verified: ${v.audit_log_verified}` : ""}`
            : `error triggered: ${s(v.error_triggered)}; handled correctly: ${s(v.error_handled_correctly)}`;
          rows.push({ category: "Workflow", id: `${doc.workflow_id ?? "workflow"}:${path.split(" ")[0]}`,
            module: s(doc.workflow_name ?? doc.workflow_id), target: path, type: s(doc.discovery_type),
            input: s(doc.pre_condition_setup), expected: path === "success path" ? `reach ${s(v.terminal_state_expected ?? "terminal state")}` : "error shown, workflow does not complete",
            actual, result: v.executed === false ? "SKIPPED" : toResult(v), evidence: s(v.evidence_screenshots), source: src });
        }
        continue;
      }
      // Permission matrix: { role, pages[], actions[], api_endpoints[] }
      if (doc.role && (doc.pages || doc.actions || doc.api_endpoints)) {
        for (const p of doc.pages ?? []) rows.push({ category: "Permission", id: `${doc.role}:${p.page_id ?? p.url}`,
          module: `role: ${doc.role}`, target: s(p.url ?? p.page_id), type: "page access", input: "",
          expected: s(p.expected ?? (p.expected_accessible === undefined ? "not specified" : (p.expected_accessible ? "allowed" : "denied"))), actual: `${p.accessible ? "allowed" : "denied"} (${s(p.direct_access_result ?? p.status_code)})`,
          result: permResult(p), evidence: s(p.screenshot), source: src });
        for (const a of doc.actions ?? []) rows.push({ category: "Permission", id: `${doc.role}:${a.table_id ?? ""}:${a.action_label}`,
          module: `role: ${doc.role}`, target: s(a.action_label), type: "action", input: `${names.tables.get(a.table_id) ?? s(a.table_id)}`,
          expected: s(a.expected ?? (a.expected_allowed === undefined ? "not specified" : (a.expected_allowed ? "allowed" : "denied"))), actual: `${a.allowed ? "allowed" : "denied"}; visible: ${s(a.visible_in_ui)}; api: ${s(a.attempted_api_result)}`,
          result: permResult(a), evidence: s(a.screenshot), source: src });
        for (const e of doc.api_endpoints ?? []) rows.push({ category: "Permission", id: `${doc.role}:${e.endpoint_id ?? e.path_pattern}`,
          module: `role: ${doc.role}`, target: `${s(e.method)} ${s(e.path_pattern)}`, type: "api", input: "",
          expected: s(e.expected ?? (e.expected_allowed === undefined ? "not specified" : (e.expected_allowed ? "allowed" : "denied"))), actual: `${e.allowed ? "allowed" : "denied"} (${s(e.status_code)})`,
          result: permResult(e), evidence: "", source: src });
        continue;
      }
      // CRUD: { module_name, test_results: [{action, passed, skipped}] }
      if (Array.isArray(doc.test_results) && doc.test_results.some((t: any) => t && t.action)) {
        const mod = doc.module_name ?? names.tables.get(doc.table_id) ?? doc.module_slug ?? basename(file);
        doc.test_results.forEach((t: any, i: number) => rows.push({ category: "CRUD",
          id: s(t.test_id ?? `${doc.module_slug ?? doc.table_id ?? "module"}:${t.action}`), module: s(mod),
          target: s(t.action), type: "crud", input: s(first(t, "input", "data", "created_record_data")),
          expected: s(first(t, "expected") ?? `${t.action} succeeds and is verified`), actual: s(first(t, "actual", "notes", "skip_reason", "error")),
          result: toResult(t), evidence: s(first(t, "evidence_screenshots", "evidence", "screenshot")), source: src }));
        continue;
      }
      // Form/field tests (standard) and hand-written test cases
      const cases = first(doc, "test_cases", "tests", "results");
      if (Array.isArray(cases)) {
        const docModule = doc.form_name ?? names.forms.get(doc.form_id);
        for (const t of cases) {
          if (!t || typeof t !== "object") continue;
          const isField = t.field_id || t.field_name || t.test_type;
          rows.push({ category: isField ? "Form / field" : "Other",
            id: s(t.test_id ?? t.id), module: s(first(t, "form_name", "form", "module") ?? names.forms.get(t.form_id) ?? docModule ?? basename(file)),
            target: s(first(t, "field_label", "field_name", "field") ?? (t.field_id ? names.fields.get(t.field_id) : undefined)),
            type: s(first(t, "test_type", "type", "category")),
            input: s(first(t, "input_value", "input", "action", "steps")),
            expected: s(first(t, "expected_outcome", "expected", "expected_result")),
            actual: s(first(t, "actual_outcome", "actual", "actual_result", "error_message_shown", "verified")),
            result: toResult(t), evidence: s(first(t, "evidence_screenshots", "evidence", "screenshot", "api_log_path")), source: src });
        }
      }
    }
  }
  return rows;
}

// ── rendering ────────────────────────────────────────────────────────────────
const CATS: Row["category"][] = ["Form / field", "Other", "CRUD", "Workflow", "UI/UX", "Permission"];
const CAT_TITLE: Record<string, string> = { "Form / field": "Form and field test cases", Other: "Functional test cases",
  CRUD: "CRUD test cases", Workflow: "Workflow test cases", "UI/UX": "UI/UX checks", Permission: "Permission (role-based access) tests" };

function totalsTable(rows: Row[]): string[] {
  const L = ["| Category | Total | ✅ Pass | ❌ Fail | ⏭️ Skipped | ℹ️ Recorded | ❔ Unknown |", "|---|---|---|---|---|---|---|"];
  for (const c of CATS) {
    const r = rows.filter(x => x.category === c); if (!r.length) continue;
    const n = (k: Result) => r.filter(x => x.result === k).length;
    L.push(`| ${CAT_TITLE[c]} | ${r.length} | ${n("PASS")} | ${n("FAIL")} | ${n("SKIPPED")} | ${n("RECORDED")} | ${n("UNKNOWN")} |`);
  }
  const n = (k: Result) => rows.filter(x => x.result === k).length;
  L.push(`| **All tests** | **${rows.length}** | **${n("PASS")}** | **${n("FAIL")}** | **${n("SKIPPED")}** | **${n("RECORDED")}** | **${n("UNKNOWN")}** |`);
  if (rows.some(x => x.result === "RECORDED")) L.push("", "ℹ️ **Recorded** = the outcome was observed (e.g. access allowed/denied) but the result file gives no expected value to judge it against.");
  return L;
}

function register(rows: Row[], heading: string): string[] {
  const L: string[] = [];
  let sec = 0;
  for (const c of CATS) {
    const r = rows.filter(x => x.category === c); if (!r.length) continue;
    sec++;
    L.push(`## ${heading}${sec}. ${CAT_TITLE[c]} (${r.length})`, "");
    const byModule = new Map<string, Row[]>();
    for (const x of r) { const k = x.module || "—"; if (!byModule.has(k)) byModule.set(k, []); byModule.get(k)!.push(x); }
    for (const [mod, list] of byModule) {
      const p = list.filter(x => x.result === "PASS").length, f = list.filter(x => x.result === "FAIL").length;
      L.push(`### ${cell(mod)} — ${list.length} tests (${p} pass, ${f} fail)`, "");
      L.push("| # | Test ID | Target | Type | Input / action | Expected | Actual | Result | Evidence |",
             "|---|---|---|---|---|---|---|---|---|");
      list.forEach((x, i) => L.push(`| ${i + 1} | ${cell(x.id)} | ${cell(x.target)} | ${cell(x.type)} | ${cell(x.input)} | ${cell(x.expected)} | ${cell(x.actual)} | ${badge(x.result)} | ${cell(x.evidence)} |`));
      L.push("");
    }
  }
  if (!L.length) L.push("*No test results found in this location.*", "");
  return L;
}

// ── legacy vs new comparison ─────────────────────────────────────────────────
// Preferred source: the comparison phase's scenario-level pairs (comparison/behavioral-diff.json →
// layer1_pass_fail_parity.items). Fallback: pair by test ID ONLY when the scenario text also matches,
// because legacy and new test plans are numbered independently (L-ADM-04 ≠ N-ADM-04 in general).
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 2));
function similar(a: string, b: string): boolean {
  const A = words(a), B = words(b); if (!A.size || !B.size) return false;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size) >= 0.6;
}
const key = (id: string) => id.replace(/^(L|N|OLD|NEW|LEGACY|LEG)[-_]/i, "").toLowerCase();
const parityBadge = (v: unknown, o: string, n: string) => {
  if (v === true) return "✅ same outcome";
  if (v === false) return /fail/i.test(n) && !/fail/i.test(o) ? "❌ regression" : "⚠️ differs";
  return "❔";
};

function parity(oldR: Row[], newR: Row[]): string[] {
  const bdFile = join(session, "comparison", "behavioral-diff.json");
  if (existsSync(bdFile)) {
    try {
      const bd = JSON.parse(readFileSync(bdFile, "utf-8"));
      const l1 = bd.layer1_pass_fail_parity;
      const items: any[] = Array.isArray(l1) ? l1 : (l1?.items ?? []);
      if (items.length) {
        const same = items.filter(i => i.parity === true).length;
        const L = [
          "Source: `comparison/behavioral-diff.json` (layer 1, pass/fail parity) — each row is one scenario compared on both systems.", "",
          `| Scenarios compared | Same outcome | Different outcome |`, `|---|---|---|`,
          `| ${items.length} | ${same} | ${items.length - same} |`, "",
          "| # | Scenario | Legacy | New | Parity | Gap / severity | Note |", "|---|---|---|---|---|---|---|",
        ];
        items.forEach((it, i) => L.push(`| ${i + 1} | ${cell(first(it, "test", "scenario", "test_id"))} | ${cell(first(it, "old", "old_result", "legacy"))} | ${cell(first(it, "new", "new_result"))} | ${parityBadge(it.parity, s(first(it, "old", "old_result")), s(first(it, "new", "new_result")))} | ${cell([it.gap_type, it.severity].filter(Boolean).join(" / "))} | ${cell(it.note ?? it.description)} |`));
        for (const layer of ["layer2_validation_message_match", "layer3_api_structural_changes", "layer4_post_action_data_state"]) {
          const lx = bd[layer]; const li: any[] = Array.isArray(lx) ? lx : (lx?.items ?? []);
          if (!li.length) continue;
          L.push("", `**${layer.replace(/_/g, " ").replace(/^layer(\d)/, "Layer $1 —")}** (${li.length})`, "",
                 "| # | Item | Legacy | New | Match | Note |", "|---|---|---|---|---|---|");
          li.forEach((it, i) => {
            const item = [first(it, "case", "test", "field", "action", "endpoint", "item", "record", "scenario"), it.change].filter(Boolean).map(s).join(" — ");
            const note = [it.severity, it.gap_type, first(it, "note", "description")].filter(Boolean).map(s).join(" · ");
            L.push(`| ${i + 1} | ${cell(item)} | ${cell(first(it, "old", "old_value", "old_message", "legacy"))} | ${cell(first(it, "new", "new_value", "new_message"))} | ${cell(first(it, "match", "parity", "same"))} | ${cell(note)} |`);
          });
        }
        return [...L, ""];
      }
    } catch { /* fall through to ID pairing */ }
  }
  // Fallback: ID + scenario-text pairing
  const nm = new Map(newR.map(r => [key(r.id), r]));
  const L = ["| # | Legacy test | New test | Scenario | Legacy result | New result | Parity |", "|---|---|---|---|---|---|---|"];
  const used = new Set<string>(); let paired = 0, i = 0;
  for (const o of oldR) {
    const n = nm.get(key(o.id));
    if (n && similar(o.input || o.target, n.input || n.target)) {
      used.add(n.id); paired++;
      const p = o.result === n.result ? "✅ same" : o.result === "PASS" && n.result === "FAIL" ? "❌ regression"
              : o.result === "FAIL" && n.result === "PASS" ? "⬆️ fixed in new" : "⚠️ differs";
      L.push(`| ${++i} | ${cell(o.id)} | ${cell(n.id)} | ${cell(n.input || n.target)} | ${badge(o.result)} | ${badge(n.result)} | ${p} |`);
    }
  }
  const lonely = [...oldR.filter(o => !L.some(l => l.includes(`| ${cell(o.id)} |`))).map(o => `- Legacy only: \`${o.id}\` — ${cell(o.input || o.target)} (${badge(o.result)})`),
                  ...newR.filter(n => !used.has(n.id)).map(n => `- New only: \`${n.id}\` — ${cell(n.input || n.target)} (${badge(n.result)})`)];
  return [
    "No `comparison/behavioral-diff.json` scenario pairs were found, so tests are paired by ID **only where the scenario text also matches**. " +
    "Unpaired tests are listed underneath — they are not compared, because legacy and new test plans are numbered independently.", "",
    paired ? L.join("\n") : "*No test could be paired safely.*", "",
    lonely.length ? `**Unpaired tests (${lonely.length})**\n\n${lonely.join("\n")}` : "", "",
  ];
}

// ── main ─────────────────────────────────────────────────────────────────────
const isMigration = existsSync(join(session, "old", "test-results")) || existsSync(join(session, "new", "test-results"));
const now = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const md: string[] = ["# Test Case Register", "",
  `**Session:** \`${basename(session.replace(/[\\/]+$/, ""))}\`  `, `**Generated:** ${now}  `,
  `**Run type:** ${isMigration ? "Migration certification (legacy vs new)" : "Application certification"}`, "",
  "Every executed test case is listed below, with its input, expected and actual outcome, result and evidence. " +
  "Long cells are truncated; the full record is in the JSON file named in each section's source.", ""];

let totalRows = 0;
if (isMigration) {
  const oldRows = collect(join(session, "old")), newRows = collect(join(session, "new"));
  totalRows = oldRows.length + newRows.length;
  md.push("## Summary — legacy system", "", ...totalsTable(oldRows), "", "## Summary — new system", "", ...totalsTable(newRows), "");
  md.push("# Part A — Side-by-side comparison (legacy vs new)", "", ...parity(oldRows, newRows));
  md.push("# Part B — Legacy system: all test cases", "", ...register(oldRows, "B."));
  md.push("# Part C — New system: all test cases", "", ...register(newRows, "C."));
} else {
  const rows = collect(session);
  totalRows = rows.length;
  md.push("## Summary", "", ...totalsTable(rows), "", "# All test cases", "", ...register(rows, ""));
}
md.push("---", "", "*Generated by `generate-pdf-report/scripts/build-test-register.ts` from the session's `test-results` JSON files.*", "");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md.join("\n"), "utf-8");
console.log(`test-case register: ${totalRows} test cases -> ${out}`);
if (totalRows === 0) { console.error("WARNING: no test results found under test-results/ (or old/ and new/)"); process.exit(3); }
