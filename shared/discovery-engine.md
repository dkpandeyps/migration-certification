# Discovery Engine — BFS + SPA Crawl Algorithm

All crawling skills follow this algorithm. Read this file at the start of any discovery phase.

---

## State Initialization

```
session_id  = timestamp slug (YYYYMMDD_HHmmss_targethost)
queue       = [root_url]           # URLs to visit next
visited     = {}                   # Set of URL patterns already visited
inventory   = empty inventory.json structure (see output-schemas.md)
pass_count  = 0
new_pages_this_pass = 0
```

---

## SPA Detection (Run Before First Page)

Before starting the BFS, detect whether the application is a Single-Page Application:

1. `browse goto {root_url}`
2. `browse snapshot -i`
3. Check if the page HTML is a shell with a single `<div id="root">` or `<div id="app">` and minimal content → SPA detected
4. Check for React/Vue/Angular indicators:
   - `browse js "typeof window.__REACT_ROUTER__ !== 'undefined' || typeof window.__vue_router__ !== 'undefined' || typeof window.ng !== 'undefined'"`
5. Record `spa_mode = true/false` in session state

---

## BFS Main Loop

```
WHILE queue is not empty OR new_pages_this_pass > 0:

  new_pages_this_pass = 0

  FOR EACH url IN queue:
    IF url IN visited: SKIP
    
    # Navigate
    browse goto {url}
    wait for page load (check for loading spinners to disappear)
    
    # Capture full page state
    snapshot = browse snapshot -i -a
    
    # Extract page identity
    page = {
      id:           generate unique ID
      url:          current URL (may differ from requested due to redirect)
      title:        extract from <title> or <h1>
      breadcrumb:   extract from nav breadcrumb component
    }
    
    # STEP A: Extract navigation structure (first page only, or when nav changes)
    IF first_page OR nav_changed:
      extract_navigation(snapshot) → add to inventory.navigation
    
    # STEP B: Activate hidden nav items
    FOR EACH hoverable nav item:
      browse hover {nav_item_ref}
      sub_snapshot = browse snapshot -i
      extract new submenu links → add to queue
    
    # STEP C: Activate all tab panels
    FOR EACH tab_button IN snapshot:
      browse click {tab_ref}
      tab_snapshot = browse snapshot -i -a
      extract forms, tables, buttons from tab_snapshot
    
    # STEP D: Extract forms
    FOR EACH form IN snapshot:
      form_data = extract_form(form)  # see form-extractor.md
      inventory.forms.append(form_data)
    
    # STEP E: Extract tables
    FOR EACH table IN snapshot:
      table_data = extract_table(table)
      inventory.tables.append(table_data)
    
    # STEP F: Trigger dialogs and extract their contents
    FOR EACH dialog_trigger IN snapshot (buttons that open modals):
      browse click {trigger_ref}
      dialog_snapshot = browse snapshot -i -a
      dialog_data = extract_dialog(dialog_snapshot)
      inventory.dialogs.append(dialog_data)
      browse press Escape  # close dialog
    
    # STEP G: Discover new links
    new_links = extract_all_links(snapshot)
    
    FOR EACH link IN new_links:
      normalized = normalize_url(link)
      IF normalized NOT IN visited AND normalized NOT IN queue:
        queue.append(normalized)
        new_pages_this_pass++
    
    # STEP H: SPA route extraction
    IF spa_mode:
      spa_routes = extract_spa_routes()  # see SPA section below
      queue.extend(spa_routes - visited - queue)
    
    # Mark as visited, add to inventory
    visited.add(url)
    inventory.pages.append(page)
    
    # Screenshot
    browse screenshot discovery/screenshots/{page_slug}.png
    
    # Write checkpoint every 5 pages
    IF len(visited) % 5 == 0:
      write checkpoint.json
  
  # End of pass
  pass_count++
  IF new_pages_this_pass == 0:
    pass_count_with_zero_new++
  ELSE:
    pass_count_with_zero_new = 0
  
  # Termination check
  IF queue is empty AND pass_count_with_zero_new >= 2:
    BREAK
```

---

## SPA Route Extraction

When `spa_mode = true`, also run these after every page visit:

### Method 1 — React Router
```javascript
browse js "
  try {
    const routes = window.__reactRouterRoutes || 
                   window.__REACT_ROUTER_ROUTES__ ||
                   (window.__remixContext && window.__remixContext.routeModules) ||
                   [];
    return JSON.stringify(routes.map(r => r.path || r.id).filter(Boolean));
  } catch(e) { return '[]'; }
"
```

### Method 2 — Vue Router
```javascript
browse js "
  try {
    const router = window.__vue_router__ || 
                   (window.__vue_app__ && window.__vue_app__.config.globalProperties.$router);
    if (router) return JSON.stringify(router.options.routes.map(r => r.path));
    return '[]';
  } catch(e) { return '[]'; }
"
```

### Method 3 — Angular Router
```javascript
browse js "
  try {
    const injector = window.ng && window.ng.getInjector(document.querySelector('app-root'));
    const router = injector && injector.get(window.ng.core.Router);
    if (router) return JSON.stringify(router.config.map(r => '/' + (r.path || '')));
    return '[]';
  } catch(e) { return '[]'; }
"
```

### Method 4 — Data attribute scan
```javascript
browse js "
  (() => {
  const selectors = '[data-route],[data-href],[ng-href],[routerLink],[to]';
  return JSON.stringify([...document.querySelectorAll(selectors)]
    .map(el => el.getAttribute('data-route') || el.getAttribute('data-href') || 
               el.getAttribute('ng-href') || el.getAttribute('routerLink') || 
               el.getAttribute('to'))
    .filter(Boolean));
})()"
```

Add all discovered routes to the queue, prefixed with the base URL.

---

## URL Normalization

Before adding a URL to visited or queue, normalize it:

1. Strip query parameters that are IDs: `?id=123` → `?id={id}`
2. Replace numeric path segments with `{id}`: `/merchants/456/edit` → `/merchants/{id}/edit`
3. Keep status/filter query params: `?status=pending` stays as-is
4. Remove hash fragments for non-SPA apps
5. Ensure same-origin only (do not crawl external URLs)

6. Apply the scope filter (below) when `scope` is set

Two URLs that normalize to the same pattern are considered the same page.
The first concrete URL seen for a pattern is what gets visited; subsequent ones are skipped.

---

## Scope Filter

When `scope` is set (comma-separated path prefixes), a normalized URL is crawled only if its path starts with one of
the prefixes. The start `url` is always crawled.

- Out-of-scope links found in the nav are still written to `inventory.json → navigation[]` with `"in_scope": false`, so the
  report shows what was deliberately left out. They are not visited and not counted in coverage.
- Inside a scoped page, everything is still exercised: every tab, dialog, row action, form, and the APIs they call — scope
  narrows *which pages*, never *how deeply* each page is tested.
- API calls made by in-scope pages are captured even if the endpoint path is outside the prefix.
- Write the scope used to `discovery/session-meta.json → scope` so later phases and reports can show it.

---

## Link Extraction

From each snapshot, extract links via:

```javascript
browse js "
  (() => {
  return JSON.stringify([
    ...[...document.querySelectorAll('a[href]')].map(a => a.href),
    ...[...document.querySelectorAll('[data-href]')].map(el => el.dataset.href),
    ...[...document.querySelectorAll('[ng-href]')].map(el => el.getAttribute('ng-href'))
  ].filter(url => url && !url.startsWith('mailto:') && !url.startsWith('tel:') && !url.startsWith('#')));
})()"
```

---

## Termination Conditions

The loop terminates when ALL of the following are true:
- `queue` is empty
- Two consecutive passes found zero new pages
- All nav items have been hovered/clicked at least once
- All tab panels have been activated

If after 200 pages the queue is not empty, pause and report to the user with the count of remaining unvisited URLs and ask whether to continue.

---

## Navigation Extraction

```
FOR EACH top-level nav item:
  extract label + url
  hover to reveal dropdown
  FOR EACH dropdown item:
    extract label + url
    IF has sub-dropdown:
      hover to reveal
      extract sub-items

Build tree structure → inventory.navigation.menu_structure
```

---

## Dialog Triggering Protocol

Dialogs must be triggered to discover their contents. For each button/link that appears to open a modal:

1. Identify trigger buttons: look for `data-toggle="modal"`, `data-bs-toggle="modal"`, `aria-haspopup="dialog"`, or buttons with labels like "Add", "Create", "Edit", "View", "Delete", "Confirm"
2. Click the trigger
3. Wait for modal to appear (`aria-modal="true"` or `role="dialog"`)
4. Take snapshot and extract form inside modal (if any)
5. Press Escape or click Close/Cancel
6. Do NOT click "Delete" or "Confirm" triggers during discovery — mark these as discovered but do not execute them

---

## Checkpoint Protocol

After every 5 pages visited, write:

```json
{
  "session_id": "...",
  "phase": "discovery",
  "visited_urls": [...],
  "queue": [...],
  "inventory_summary": {"pages": N, "forms": N, "fields": N},
  "last_updated": "ISO timestamp"
}
```

On startup, if `checkpoint.json` exists with `phase = "discovery"`:
- Ask user: "Resume discovery from checkpoint? (Y/n)"
- If yes: restore `visited` and `queue` from checkpoint, continue BFS
- If no: delete checkpoint and start fresh
