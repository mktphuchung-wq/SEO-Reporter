import { escapeHtml } from "./components.js";

export function selected(value, expected) {
  return value === expected ? "selected" : "";
}

export function checked(value) {
  return value ? "checked" : "";
}

export function renderFieldHelper(text) {
  return text ? `<p class="helper">${escapeHtml(text)}</p>` : "";
}

export function renderOption(value, label, currentValue = "") {
  return `<option value="${escapeHtml(value)}" ${selected(value, currentValue)}>${escapeHtml(label)}</option>`;
}
