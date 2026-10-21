/**
 * CloudTel input primitives: labelled form fields with inline error display.
 */

let fieldCounter = 0;

/**
 * Create a labelled form field.
 * @param {object} options
 * @param {string} options.label
 * @param {string} [options.name]
 * @param {string} [options.type] - input type
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 * @param {boolean} [options.required]
 * @param {boolean} [options.autocomplete]
 * @param {string} [options.hint]
 * @param {string} [options.autofocus]
 * @param {boolean} [options.togglePassword] - show visibility toggle for password fields
 * @param {Record<string,string>} [options.attrs]
 * @returns {{ element: HTMLElement, input: HTMLInputElement, setError: (msg?: string|null) => void, setValue: (v: string) => void, getValue: () => string, focus: () => void }}
 */
export function createField(options = {}) {
  const {
    label,
    name = `field-${++fieldCounter}`,
    type = "text",
    value = "",
    placeholder = "",
    required = false,
    hint = "",
    autocomplete,
    togglePassword = false,
    attrs = {},
  } = options;

  const field = document.createElement("div");
  field.className = "field";

  const labelEl = document.createElement("label");
  labelEl.className = "field-label";
  labelEl.setAttribute("for", `${name}-input`);
  labelEl.textContent = label;
  if (required) {
    const req = document.createElement("span");
    req.className = "field-required";
    req.setAttribute("aria-hidden", "true");
    req.textContent = " *";
    labelEl.append(req);
  }
  field.append(labelEl);

  const inputWrap = document.createElement("div");
  inputWrap.className = "input-wrap";
  const input = document.createElement("input");
  input.className = togglePassword ? "input input--with-action" : "input";
  input.id = `${name}-input`;
  input.name = name;
  input.type = type;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  for (const [key, val] of Object.entries(attrs)) input.setAttribute(key, val);
  inputWrap.append(input);

  if (togglePassword && type === "password") {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "input-group-action";
    toggle.setAttribute("aria-label", "Show password");
    toggle.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggle.addEventListener("click", () => {
      const shown = input.type === "text";
      input.type = shown ? "password" : "text";
      toggle.setAttribute("aria-label", shown ? "Show password" : "Hide password");
    });
    inputWrap.append(toggle);
  }
  field.append(inputWrap);

  const errorEl = document.createElement("p");
  errorEl.className = "field-error";
  errorEl.id = `${name}-error`;
  errorEl.hidden = true;
  field.append(errorEl);

  let hintEl = null;
  if (hint) {
    hintEl = document.createElement("p");
    hintEl.className = "field-hint";
    hintEl.textContent = hint;
    field.append(hintEl);
  }

  function setError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      input.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", errorEl.id);
    } else {
      errorEl.hidden = true;
      errorEl.textContent = "";
      input.classList.remove("has-error");
      input.removeAttribute("aria-invalid");
    }
  }

  input.addEventListener("input", () => setError(null));

  return {
    element: field,
    input,
    setError,
    setValue: (v) => {
      input.value = v ?? "";
    },
    getValue: () => input.value,
    focus: () => input.focus(),
  };
}

/** Create a select field with the same field chrome. */
export function createSelectField(options = {}) {
  const {
    label,
    name = `select-${++fieldCounter}`,
    options: optionList = [],
    value = "",
    required = false,
  } = options;

  const field = document.createElement("div");
  field.className = "field";
  const labelEl = document.createElement("label");
  labelEl.className = "field-label";
  labelEl.setAttribute("for", `${name}-select`);
  labelEl.textContent = label;
  field.append(labelEl);

  const select = document.createElement("select");
  select.className = "select";
  select.id = `${name}-select`;
  select.name = name;
  if (required) select.required = true;
  for (const opt of optionList) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    if (opt.disabled) option.disabled = true;
    select.append(option);
  }
  field.append(select);

  const errorEl = document.createElement("p");
  errorEl.className = "field-error";
  errorEl.hidden = true;
  field.append(errorEl);

  return {
    element: field,
    input: select,
    setError: (message) => {
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
      select.classList.toggle("has-error", Boolean(message));
    },
    setValue: (v) => {
      select.value = v ?? "";
    },
    getValue: () => select.value,
    focus: () => select.focus(),
  };
}

/** Create a textarea field. */
export function createTextareaField(options = {}) {
  const { label, name = `textarea-${++fieldCounter}`, value = "", rows = 4, placeholder = "" } = options;
  const field = document.createElement("div");
  field.className = "field";
  const labelEl = document.createElement("label");
  labelEl.className = "field-label";
  labelEl.setAttribute("for", `${name}-textarea`);
  labelEl.textContent = label;
  field.append(labelEl);

  const textarea = document.createElement("textarea");
  textarea.className = "textarea";
  textarea.id = `${name}-textarea`;
  textarea.name = name;
  textarea.rows = rows;
  textarea.value = value ?? "";
  if (placeholder) textarea.placeholder = placeholder;
  field.append(textarea);

  const errorEl = document.createElement("p");
  errorEl.className = "field-error";
  errorEl.hidden = true;
  field.append(errorEl);

  return {
    element: field,
    input: textarea,
    setError: (message) => {
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
      textarea.classList.toggle("has-error", Boolean(message));
    },
    setValue: (v) => {
      textarea.value = v ?? "";
    },
    getValue: () => textarea.value,
    focus: () => textarea.focus(),
  };
}
