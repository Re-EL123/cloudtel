/**
 * Contacts feature: searchable list, detail panel with click-to-call, and
 * create/edit/delete for personal and organisation contacts.
 */
import { CONTACT_SCOPES, PERMISSIONS } from "../shared/index.js";
import { validateContact } from "../shared/validation-rules.js";
import { contactsApi } from "../core/endpoints.js";
import { handleError } from "../core/error-handler.js";
import { setPageTitle } from "../core/app-shell.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatPhone, debounce, clearChildren } from "../core/utils.js";
import { icon } from "../components/icons.js";
import { avatar, badge, emptyState, loadingRows } from "../components/common.js";
import { openDialog, confirmDialog } from "../ui/dialogs.js";
import { createField } from "../ui/inputs.js";
import { notifySuccess } from "../ui/notifications.js";
import { startCall } from "./dialer.js";

let contacts = [];
let selectedId = null;
let searchQuery = "";

export async function initContacts() {
  setPageTitle("Contacts");
  renderLayout();
  wireToolbar();
  await loadContacts();
}

function renderLayout() {
  const root = document.querySelector("[data-contacts-root]");
  if (!root) return;
  root.innerHTML = `
    <div class="contacts-layout">
      <div>
        <div class="toolbar toolbar-search">
          <div class="input-group">
            <span class="input-group-icon">${icon("search", { size: 18 }).outerHTML}</span>
            <input class="input" type="search" placeholder="Search contacts…" data-contact-search aria-label="Search contacts" />
          </div>
          <button type="button" class="btn btn--primary" data-contact-new>
            ${icon("userPlus", { size: 18 }).outerHTML}<span>New contact</span>
          </button>
        </div>
        <div data-contact-list></div>
      </div>
      <aside class="contact-detail card" data-contact-detail></aside>
    </div>`;

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (q) {
    searchQuery = q;
    const search = root.querySelector("[data-contact-search]");
    if (search) search.value = q;
  }
}

function wireToolbar() {
  const search = document.querySelector("[data-contact-search]");
  search?.addEventListener("input", debounce(() => {
    searchQuery = search.value.trim();
    loadContacts();
  }, 300));

  document.querySelector("[data-contact-new]")?.addEventListener("click", () => openContactForm(null));
}

async function loadContacts() {
  const list = document.querySelector("[data-contact-list]");
  if (!list) return;
  clearChildren(list);
  list.append(loadingRows(6));
  try {
    const result = searchQuery
      ? await contactsApi.search({ q: searchQuery, limit: 50 })
      : await contactsApi.list({ pageSize: 50 });
    contacts = result?.items || result || [];
    renderList();
  } catch (error) {
    list.replaceChildren(emptyState({ icon: "alertCircle", title: "Could not load contacts", message: error?.message || "" }));
  }
}

function renderList() {
  const list = document.querySelector("[data-contact-list]");
  if (!list) return;
  clearChildren(list);

  if (!contacts.length) {
    list.append(
      emptyState({
        icon: "users",
        title: searchQuery ? "No matches" : "No contacts yet",
        message: searchQuery ? `Nothing matched "${searchQuery}".` : "Add your first contact to call and message faster.",
      })
    );
    renderDetail(null);
    return;
  }

  const container = document.createElement("div");
  container.className = "contact-list";
  for (const contact of contacts) {
    container.append(contactRow(contact));
  }
  list.append(container);

  if (!selectedId && contacts[0]) selectedId = contacts[0].id;
  renderDetail(contacts.find((c) => c.id === selectedId) || null);
}

function contactRow(contact) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `contact-row${contact.id === selectedId ? " is-selected" : ""}`;
  row.dataset.contactId = contact.id;

  row.append(avatar({ name: contact.fullName || contact.displayName, src: contact.avatarUrl }));

  const info = document.createElement("div");
  info.className = "contact-row-info";
  const scope = contact.scope === CONTACT_SCOPES.ORGANISATION ? "Organisation" : "Personal";
  info.innerHTML = `
    <div class="contact-row-name">${escapeHtml(contact.fullName || contact.displayName || "Unnamed")}${contact.isFavourite ? ` ${icon("star", { size: 14 }).outerHTML}` : ""}</div>
    <div class="contact-row-meta">${escapeHtml(formatPhone(contact.phone) || contact.email || "")} · ${escapeHtml(scope)}</div>`;

  const actions = document.createElement("div");
  actions.className = "contact-row-actions";
  const callBtn = document.createElement("span");
  callBtn.className = "btn btn--ghost btn--icon btn--sm";
  callBtn.setAttribute("role", "button");
  callBtn.setAttribute("aria-label", "Call contact");
  callBtn.append(icon("phoneCall", { size: 16 }));
  callBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    callContact(contact);
  });
  actions.append(callBtn);

  row.append(info, actions);
  row.addEventListener("click", () => {
    selectedId = contact.id;
    document.querySelectorAll(".contact-row").forEach((r) => r.classList.toggle("is-selected", r.dataset.contactId === contact.id));
    renderDetail(contact);
  });
  return row;
}

function renderDetail(contact) {
  const detail = document.querySelector("[data-contact-detail]");
  if (!detail) return;
  clearChildren(detail);

  if (!contact) {
    detail.append(emptyState({ icon: "user", title: "No contact selected", message: "Choose a contact to see their details." }));
    return;
  }

  const hero = document.createElement("div");
  hero.className = "contact-detail-hero";
  hero.append(avatar({ name: contact.fullName || contact.displayName, src: contact.avatarUrl, size: "lg" }));
  const name = document.createElement("div");
  name.className = "contact-detail-name";
  name.textContent = contact.fullName || contact.displayName || "Unnamed";
  hero.append(name);
  if (contact.company || contact.department) {
    const sub = document.createElement("div");
    sub.className = "contact-detail-sub";
    sub.textContent = [contact.company, contact.department].filter(Boolean).join(" · ");
    hero.append(sub);
  }
  detail.append(hero);

  const actions = document.createElement("div");
  actions.className = "contact-detail-actions";
  actions.append(actionButton("Call", "phoneCall", "primary", () => callContact(contact)));
  actions.append(actionButton("Edit", "edit", "secondary", () => openContactForm(contact)));
  actions.append(actionButton("Delete", "trash", "danger-outline", () => deleteContact(contact)));
  detail.append(actions);

  const fields = document.createElement("div");
  fields.className = "contact-detail-fields";
  for (const [label, value, href] of [
    ["Phone", formatPhone(contact.phone), contact.phone ? `tel:${contact.phone}` : null],
    ["Email", contact.email, contact.email ? `mailto:${contact.email}` : null],
    ["Company", contact.company, null],
    ["Department", contact.department, null],
    ["Notes", contact.notes, null],
  ]) {
    if (!value) continue;
    const field = document.createElement("div");
    const labelEl = document.createElement("div");
    labelEl.className = "contact-field-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "contact-field-value";
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = value;
      valueEl.append(link);
    } else {
      valueEl.textContent = value;
    }
    field.append(labelEl, valueEl);
    fields.append(field);
  }
  detail.append(fields);
}

function actionButton(label, iconName, variant, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn btn--${variant} btn--sm`;
  btn.append(icon(iconName, { size: 16 }));
  const span = document.createElement("span");
  span.textContent = label;
  btn.append(span);
  btn.addEventListener("click", onClick);
  return btn;
}

function callContact(contact) {
  const target = contact.phone || contact.extensionNumber;
  if (!target) return;
  startCallWith(target, contact.fullName || contact.displayName);
}

function startCallWith(target, name) {
  // Route through the dialer by priming the number then invoking its call flow.
  window.location.href = `/dialer.html?call=${encodeURIComponent(target)}&name=${encodeURIComponent(name || "")}`;
}

function openContactForm(contact) {
  const isEdit = Boolean(contact);
  const fields = {
    fullName: createField({ label: "Full name", value: contact?.fullName || "", required: true, autocomplete: "name" }),
    phone: createField({ label: "Phone", type: "tel", value: contact?.phone || "", required: true, autocomplete: "tel" }),
    email: createField({ label: "Email", type: "email", value: contact?.email || "", autocomplete: "email" }),
    company: createField({ label: "Company", value: contact?.company || "", autocomplete: "organization" }),
    department: createField({ label: "Department", value: contact?.department || "" }),
    notes: createField({ label: "Notes", value: contact?.notes || "" }),
  };
  const scopeSelect = document.createElement("select");
  scopeSelect.className = "select";
  scopeSelect.id = "contact-scope";
  for (const [value, label] of [["personal", "Personal"], ["organisation", "Organisation"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if ((contact?.scope || "personal") === value) option.selected = true;
    scopeSelect.append(option);
  }
  if (!canManageOrganisationContacts() && !isEdit) scopeSelect.value = "personal";

  const body = document.createElement("div");
  body.className = "stack";
  body.append(
    fields.fullName.element,
    fields.phone.element,
    fields.email.element,
    fields.company.element,
    fields.department.element,
    scopeSelect.parentElement === null
      ? (() => {
          const wrap = document.createElement("div");
          wrap.className = "field";
          const l = document.createElement("label");
          l.className = "field-label";
          l.setAttribute("for", "contact-scope");
          l.textContent = "Scope";
          wrap.append(l, scopeSelect);
          return wrap;
        })()
      : scopeSelect,
    fields.notes.element
  );

  const dialog = openDialog({
    title: isEdit ? "Edit contact" : "New contact",
    body: [body],
    actions: [
      { label: "Cancel", variant: "secondary", value: "cancel" },
      { label: isEdit ? "Save" : "Create", variant: "primary", value: "save", autofocus: true },
    ],
  });

  dialog.promise.then(async (value) => {
    if (value !== "save") return;
    const payload = {
      fullName: fields.fullName.getValue().trim(),
      phone: fields.phone.getValue().trim(),
      email: fields.email.getValue().trim() || undefined,
      company: fields.company.getValue().trim() || undefined,
      department: fields.department.getValue().trim() || undefined,
      notes: fields.notes.getValue().trim() || undefined,
      scope: scopeSelect.value,
    };
    const validation = validateContact(payload);
    if (!validation.valid) {
      for (const [field, message] of Object.entries(validation.errors || {})) {
        fields[field]?.setError?.(message);
      }
      return;
    }
    try {
      if (isEdit) {
        await contactsApi.update(contact.id, payload);
        notifySuccess("Contact updated.");
      } else {
        await contactsApi.create(payload);
        notifySuccess("Contact created.");
      }
      await loadContacts();
    } catch (error) {
      const info = handleError(error);
      if (info.fields) {
        for (const [field, message] of Object.entries(info.fields)) fields[field]?.setError?.(message);
      }
    }
  });
}

async function deleteContact(contact) {
  const ok = await confirmDialog({
    title: "Delete contact",
    message: `Delete ${contact.fullName || contact.displayName}? This cannot be undone.`,
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await contactsApi.remove(contact.id);
    selectedId = null;
    notifySuccess("Contact deleted.");
    await loadContacts();
  } catch (error) {
    handleError(error);
  }
}

function canManageOrganisationContacts() {
  const permissions = getState().permissions || [];
  return permissions.includes(PERMISSIONS.CONTACTS_UPDATE_ORG) || permissions.includes(PERMISSIONS.ADMIN_DASHBOARD);
}
