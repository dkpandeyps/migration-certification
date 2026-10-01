# Form Extractor — Field Discovery and Metadata Extraction

Apply this protocol whenever a form is found during discovery, including forms inside dialogs and tab panels.

---

## Identifying Forms

A "form" is any of:
- An HTML `<form>` element
- A container with `role="form"`
- A card/panel with multiple input fields and a submit button
- A modal/dialog containing input fields
- A multi-step wizard step

```bash
FORMS=$($BROWSE js "
  (() => {
  const forms = [];
  
  // Standard form elements
  document.querySelectorAll('form').forEach((f, i) => {
    forms.push({
      type: 'form',
      index: i,
      action: f.action || window.location.href,
      method: f.method || 'GET',
      id: f.id || f.name || null
    });
  });
  
  // Role-based forms
  document.querySelectorAll('[role=\"form\"]').forEach((f, i) => {
    forms.push({type: 'role_form', index: i});
  });
  
  return JSON.stringify(forms);
})()")
```

---

## Field Extraction Per Form

For each identified form, extract all its fields:

```bash
FIELDS=$($BROWSE js "
  (() => {
  function extractFields(container) {
    const fields = [];
    container.querySelectorAll('input,select,textarea,[role=\"combobox\"],[role=\"listbox\"]').forEach(el => {
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset') return;
      
      // Find associated label
      let label = '';
      if (el.id) {
        const labelEl = document.querySelector('label[for=\"' + el.id + '\"]');
        if (labelEl) label = labelEl.textContent.trim();
      }
      if (!label) {
        const parent = el.closest('.form-group, .field-wrapper, .input-group, [class*=\"field\"], [class*=\"form\"]');
        if (parent) {
          const labelEl = parent.querySelector('label');
          if (labelEl) label = labelEl.textContent.trim();
        }
      }
      if (!label) label = el.placeholder || el.name || el.id || 'unknown';
      
      // Clean label (remove asterisk = required marker)
      const required = label.includes('*') || el.required || el.getAttribute('aria-required') === 'true';
      label = label.replace(/\*/g, '').trim();
      
      // Field type detection
      let fieldType = el.tagName.toLowerCase();
      if (el.tagName === 'INPUT') fieldType = el.type || 'text';
      if (el.tagName === 'SELECT') fieldType = el.multiple ? 'multiselect' : 'select';
      
      // Options for select/radio/checkbox groups
      let options = [];
      if (el.tagName === 'SELECT') {
        options = [...el.options].map(o => ({value: o.value, label: o.text.trim()})).filter(o => o.value !== '');
      }
      if (el.type === 'radio' || el.type === 'checkbox') {
        // Find all sibling radio/checkbox inputs with same name
        const siblings = container.querySelectorAll('input[type=\"' + el.type + '\"][name=\"' + el.name + '\"]');
        options = [...siblings].map(s => {
          const sLabel = s.id ? document.querySelector('label[for=\"' + s.id + '\"]') : null;
          return {value: s.value, label: sLabel ? sLabel.textContent.trim() : s.value};
        });
      }
      
      // Min/max/pattern
      const minLen = el.minLength > 0 ? el.minLength : null;
      const maxLen = el.maxLength > 0 ? el.maxLength : null;
      const min = el.min || null;
      const max = el.max || null;
      const pattern = el.pattern || null;
      
      fields.push({
        field_name: el.name || el.id || label.toLowerCase().replace(/\s+/g, '_'),
        field_label: label,
        field_type: fieldType,
        required: required,
        placeholder: el.placeholder || null,
        default_value: el.value || null,
        min_length: minLen,
        max_length: maxLen,
        min: min,
        max: max,
        pattern: pattern,
        options: options,
        html_id: el.id || null
      });
    });
    return fields;
  }
  
  // Extract from all forms
  const results = {};
  document.querySelectorAll('form').forEach((f, i) => {
    results['form_' + i] = extractFields(f);
  });
  return JSON.stringify(results);
})()")
```

---

## Dependency Detection

After extracting all fields, detect conditional dependencies:

```bash
$BROWSE js "
  (() => {
  // Look for fields that appear/disappear when other fields change
  const deps = [];
  document.querySelectorAll('[data-depends-on],[data-show-if],[data-hide-if],[data-conditional]').forEach(el => {
    deps.push({
      field: el.name || el.id,
      depends_on: el.dataset.dependsOn || el.dataset.showIf || el.dataset.hideIf
    });
  });
  
  // Look for Vue v-if / React conditional rendering clues
  document.querySelectorAll('[class*=\"conditional\"], [class*=\"depends\"]').forEach(el => {
    const input = el.querySelector('input,select,textarea');
    if (input) deps.push({field: input.name || input.id, depends_on: 'unknown_condition'});
  });
  
  return JSON.stringify(deps);
})()"
```

Set `depends_on` and `dependency_of` on the relevant field objects.

---

## Validation Rule Extraction

```bash
$BROWSE js "
  (() => {
  const rules = {};
  document.querySelectorAll('input,select,textarea').forEach(el => {
    const fieldRules = [];
    if (el.required) fieldRules.push('required');
    if (el.minLength > 0) fieldRules.push('min:' + el.minLength);
    if (el.maxLength > 0) fieldRules.push('max:' + el.maxLength);
    if (el.min) fieldRules.push('min_value:' + el.min);
    if (el.max) fieldRules.push('max_value:' + el.max);
    if (el.pattern) fieldRules.push('pattern:' + el.pattern);
    if (el.type === 'email') fieldRules.push('email');
    if (el.type === 'url') fieldRules.push('url');
    if (el.type === 'number') fieldRules.push('numeric');
    // Check data-validate / data-rules attributes
    if (el.dataset.validate) fieldRules.push(...el.dataset.validate.split('|'));
    if (el.dataset.rules) fieldRules.push(...el.dataset.rules.split(','));
    if (fieldRules.length > 0) rules[el.name || el.id] = fieldRules;
  });
  return JSON.stringify(rules);
})()"
```

Add extracted rules to the `validation_rules` array of each field.

---

## Role Visibility Tagging

When running multi-role discovery, tag each form and field with which role discovered it:

```json
{
  "form_id": "form_001",
  "visible_to_roles": ["admin", "support"],
  "fields": [
    {
      "field_id": "field_001",
      "visible_to_roles": ["admin", "support"]
    }
  ]
}
```

If a form is only visible to `admin` but not `merchant`, that is important permission coverage data.

---

## Form Naming Convention

Assign human-readable names to forms based on:
1. The dialog/modal title (if inside a modal)
2. The form's `aria-label` or `aria-labelledby`
3. The heading (`<h1>`, `<h2>`, `<h3>`) immediately preceding the form
4. The submit button's text + the page title (e.g., "Create" on Merchants page = "Create Merchant")

Slugify the name for use as a filename: `create_merchant`, `edit_profile`, `login_form`.

---

## Multi-Step Form (Wizard) Handling

If a form has "Next", "Previous", "Continue", or step-indicator elements:
1. Extract fields from Step 1 (visible fields only)
2. Fill required fields with placeholder values and click "Next"
3. Extract fields from Step 2
4. Repeat until the final step is reached
5. Press "Previous" to return without submitting
6. Record all steps and their fields under a single form object with `wizard: true` and `steps: [...]`
