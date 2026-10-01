# BFS Crawl Protocol — Step-by-Step Discovery Instructions

This file provides the complete discovery loop instructions for the `discover-app` skill.
Read `shared/discovery-engine.md` first for the algorithm overview; this file provides the detailed per-step procedures.

---

## Pre-Loop Setup

Before starting the loop, initialize state:

```bash
# In-memory state (represented as JSON files for checkpointing)
echo '{"visited": [], "queue": [], "pass": 0, "new_this_pass": 0}' > "$SESSION_DIR/discovery/crawl-state.json"

# Add root URL to queue
ROOT_URL="${url%/}"   # strip trailing slash
echo "[$ROOT_URL]" > /tmp/crawl_queue.txt
```

---

## Per-Page Procedure

For each URL dequeued from the BFS queue:

### Step 1 — Navigate
```bash
$BROWSE goto "$CURRENT_URL"
$BROWSE wait --networkidle
```

If the page redirects (e.g., to a login page), check session validity and re-login if needed.

### Step 2 — Record Identity
```bash
TITLE=$($BROWSE js "document.title")
CURRENT_URL_ACTUAL=$($BROWSE js "window.location.href")
BREADCRUMB=$($BROWSE js "
  (() => {
  const bc = document.querySelector('[aria-label=\"breadcrumb\"], .breadcrumb, nav.breadcrumb');
  return bc ? JSON.stringify([...bc.querySelectorAll('li,a,span')].map(el => el.textContent.trim()).filter(t => t && t !== '/')) : '[]';
})()")
```

### Step 3 — Full Snapshot
```bash
SNAPSHOT=$($BROWSE snapshot -i -a)
```

Save the snapshot text for extraction steps below.

### Step 4 — Nav Extraction (on first page, or if nav has changed)
```bash
# Extract top-level nav items
NAV_ITEMS=$($BROWSE js "
  (() => {
  const navItems = [];
  document.querySelectorAll('nav a, [role=\"navigation\"] a, .nav-menu a, .sidebar a, .menu a').forEach(a => {
    if (a.href && !a.href.startsWith('javascript:')) {
      navItems.push({label: a.textContent.trim(), url: a.href});
    }
  });
  return JSON.stringify(navItems);
})()")

# Hover each nav item to reveal dropdowns
# Parse SNAPSHOT for nav refs with labels, then hover each
$BROWSE hover @e_nav_item_1   # repeat for each discovered nav ref
$BROWSE snapshot -a
# Extract sub-items from expanded dropdown
```

### Step 5 — Tab Panel Activation
```bash
# Find all tab buttons in snapshot
TAB_BUTTONS=$($BROWSE js "
  (() => {
  return JSON.stringify([...document.querySelectorAll('[role=\"tab\"], .nav-tab, .tab-button')].map(t => ({
    label: t.textContent.trim(),
    active: t.classList.contains('active') || t.getAttribute('aria-selected') === 'true'
  })));
})()")

# Click each inactive tab and snapshot
# For each tab ref found in snapshot:
$BROWSE click @e_tab_ref
sleep 0.5
$BROWSE snapshot -i -a
# Extract forms/tables from this tab panel
```

### Step 6 — Form Extraction
Read `form-extractor.md` and apply the form extraction protocol to the current snapshot.

For each form found:
- Extract all fields (see form-extractor.md)
- Assign unique IDs: `form_{page_id}_{sequence}`
- Record `page_id` back-reference
- Append to `inventory.forms[]`

### Step 7 — Table Extraction
```bash
TABLES=$($BROWSE js "
  (() => {
  const tables = [];
  document.querySelectorAll('table, [role=\"grid\"], .data-table, .ag-root').forEach((t, i) => {
    const headers = [...t.querySelectorAll('th, [role=\"columnheader\"]')].map(h => h.textContent.trim());
    const rowActions = [...t.querySelectorAll('tbody tr:first-child .action-btn, tbody tr:first-child [class*=\"action\"]')].map(b => b.textContent.trim());
    tables.push({index: i, headers, rowActions});
  });
  return JSON.stringify(tables);
})()")

# Also check for row action buttons by looking at the first data row
# Record bulk actions from table header action buttons
BULK_ACTIONS=$($BROWSE js "JSON.stringify([...document.querySelectorAll('.bulk-actions button, [class*=\"bulk\"] button')].map(b => b.textContent.trim()))")
```

### Step 8 — Dialog Triggering

**IMPORTANT:** Only trigger dialogs for discovery. Do NOT confirm or execute destructive actions.

```bash
# Find dialog triggers (buttons that open modals — NOT Delete/Confirm buttons)
DIALOG_TRIGGERS=$($BROWSE js "
  (() => {
  const triggers = [];
  document.querySelectorAll('[data-bs-toggle=\"modal\"], [data-toggle=\"modal\"], [aria-haspopup=\"dialog\"]').forEach(el => {
    triggers.push({label: el.textContent.trim(), ref: null});
  });
  // Also look for 'Add', 'Create', 'Edit', 'View', 'Filter' buttons
  document.querySelectorAll('button, a').forEach(el => {
    const text = el.textContent.trim().toLowerCase();
    if (['add','create','new','edit','view','filter','import','export'].some(kw => text.includes(kw))) {
      triggers.push({label: el.textContent.trim(), ref: null});
    }
  });
  return JSON.stringify(triggers);
})()")

# For each safe trigger: click, snapshot, extract dialog form, press Escape
# Skip: Delete, Remove, Deactivate, Approve, Reject triggers during discovery phase
```

After triggering each dialog:
- Extract form inside dialog (apply form-extractor.md)
- Record dialog in `inventory.dialogs[]`
- Close dialog before proceeding

### Step 9 — Link Discovery
```bash
ALL_LINKS=$($BROWSE js "
  (() => {
  const links = new Set();
  // Standard links
  document.querySelectorAll('a[href]').forEach(a => {
    try { const u = new URL(a.href); if (u.origin === window.location.origin) links.add(u.pathname + u.search); }
    catch(e) {}
  });
  // Data attributes
  document.querySelectorAll('[data-href],[data-url],[data-route]').forEach(el => {
    const v = el.dataset.href || el.dataset.url || el.dataset.route;
    if (v && v.startsWith('/')) links.add(v);
  });
  // SPA router links
  document.querySelectorAll('[routerLink],[to],[ng-href]').forEach(el => {
    const v = el.getAttribute('routerLink') || el.getAttribute('to') || el.getAttribute('ng-href');
    if (v && v.startsWith('/')) links.add(v);
  });
  return JSON.stringify([...links]);
})()")
```

Add new links to queue after normalization (see discovery-engine.md → URL Normalization).

### Step 10 — SPA Route Extraction (if SPA_MODE=true)
Execute the four SPA route extraction methods from `shared/discovery-engine.md → SPA Route Extraction`.
Add any routes not already in visited or queue.

### Step 11 — API Log Capture
```bash
API_LOGS=$($BROWSE js "JSON.stringify(window.__apiLogs || [])")
# Append to session API inventory
$BROWSE js "window.__apiLogs = []"  # reset for next page
```

Write captured logs to `evidence/api-logs/`.

### Step 12 — Screenshot
```bash
PAGE_SLUG=$(echo "$CURRENT_URL_ACTUAL" | sed 's|https\?://[^/]*||' | sed 's|[^a-zA-Z0-9]|_|g' | cut -c1-50)
$BROWSE screenshot "$SESSION_DIR/discovery/screenshots/${PAGE_SLUG}.png"
```

### Step 13 — Record Page in Inventory
Build the page object and append to `inventory.pages[]`:
```json
{
  "id": "page_{sequence}",
  "url": "{normalized_url}",
  "title": "{TITLE}",
  "breadcrumb": {breadcrumb_array},
  "screenshot_path": "discovery/screenshots/{PAGE_SLUG}.png"
}
```

### Step 14 — Update Checkpoint (every 5 pages)
```bash
if [ $((PAGE_COUNT % 5)) -eq 0 ]; then
  # Write checkpoint.json with current visited set, queue, and inventory counts
  echo "Checkpoint saved at $PAGE_COUNT pages"
fi
```

---

## Termination Check

After each complete pass through the queue:

```bash
if [ ${#QUEUE[@]} -eq 0 ] && [ $NEW_PAGES_THIS_PASS -eq 0 ]; then
  ZERO_NEW_PASSES=$((ZERO_NEW_PASSES + 1))
else
  ZERO_NEW_PASSES=0
fi

if [ $ZERO_NEW_PASSES -ge 2 ]; then
  echo "Termination: 2 consecutive passes with 0 new pages. Discovery complete."
  break
fi
```

---

## Large App Safety Check

If `PAGE_COUNT > 200`:
```
Pause and ask user:
"Discovery has found 200+ pages. Continue? (This may take 30+ more minutes)
Discovered so far: {N} pages, {N} forms, {N} fields
Remaining in queue: {N} URLs"
```
