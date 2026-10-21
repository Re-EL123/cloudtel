/** Accessible dropdown menu anchored to a trigger element. */
import { icon } from "./icons.js";
import { uid } from "../core/utils.js";

let openMenu = null;

/**
 * @param {HTMLElement} trigger
 * @param {Array<{label?:string, icon?:string, onSelect?:Function, danger?:boolean, separator?:boolean, disabled?:boolean, checked?:boolean}>} items
 * @param {{align?:'left'|'right'}} [options]
 */
export function attachMenu(trigger, items, options = {}) {
  const { align = "right" } = options;

  if (trigger.dataset.menuBound === "true") return;
  trigger.dataset.menuBound = "true";

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.id = uid("menu");
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const rendered = [];
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "menu-separator";
      menu.append(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `menu-item${item.danger ? " menu-item--danger" : ""}`;
    btn.setAttribute("role", "menuitem");
    if (item.disabled) btn.disabled = true;
    if (item.icon) btn.append(icon(item.icon, { size: 16 }));
    const label = document.createElement("span");
    label.className = "grow";
    label.textContent = item.label;
    btn.append(label);
    if (item.checked) btn.append(icon("check", { size: 16 }));
    btn.addEventListener("click", () => {
      closeMenu();
      item.onSelect?.();
    });
    menu.append(btn);
    rendered.push(btn);
  }

  let anchor = document.body;

  function position() {
    const rect = trigger.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    if (align === "right") menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
    else menu.style.left = `${rect.left}px`;
    menu.style.right = "auto";
    menu.style.zIndex = "var(--z-overlay)";
  }

  function open() {
    if (openMenu && openMenu !== closeMenu) openMenu();
    menu.hidden = false;
    anchor.append(menu);
    position();
    openMenu = closeMenu;
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    trigger.setAttribute("aria-expanded", "true");
    rendered.find((b) => !b.disabled)?.focus();
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    if (menu.parentElement) menu.parentElement.removeChild(menu);
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    trigger.setAttribute("aria-expanded", "false");
    if (openMenu === closeMenu) openMenu = null;
  }

  function onOutside(event) {
    if (menu.contains(event.target) || trigger.contains(event.target)) return;
    closeMenu();
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu();
      trigger.focus();
    }
  }

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", menu.id);
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (menu.hidden) open();
    else closeMenu();
  });

  return { close: closeMenu, open };
}

export function closeAllMenus() {
  openMenu?.();
}
