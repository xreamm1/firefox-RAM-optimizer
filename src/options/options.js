"use strict";

/* global DEFAULT_SETTINGS, getSettings, normalizeDomain, localizePage, t */

const form = document.getElementById("form");

function fill(s) {
  for (const [key, value] of Object.entries(s)) {
    const el = form.elements[key];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!value;
    else if (key === "whitelist") el.value = value.join("\n");
    else el.value = value;
  }
}

function read() {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const el = form.elements[key];
    if (!el) continue;
    if (el.type === "checkbox") {
      out[key] = el.checked;
    } else if (key === "whitelist") {
      out[key] = [...new Set(el.value.split(/[\s,]+/).map(normalizeDomain).filter(Boolean))].sort();
    } else if (typeof def === "number") {
      const n = Math.round(Number(el.value));
      const min = Number(el.min || 0);
      const max = Number(el.max || Infinity);
      out[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    }
  }
  return out;
}

function flash(text) {
  const el = document.getElementById("status");
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 2000);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const next = Object.assign(await getSettings(), read());
  await browser.storage.local.set({ settings: next });
  fill(next);
  flash(t("saved"));
});

document.getElementById("reset").addEventListener("click", async () => {
  const defaults = Object.assign({}, DEFAULT_SETTINGS);
  await browser.storage.local.set({ settings: defaults });
  fill(defaults);
  flash(t("saved"));
});

document.getElementById("resetStats").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ cmd: "resetStats" });
  flash(t("saved"));
});

document.getElementById("runNow").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ cmd: "runNow" });
  flash("✓");
});

document.addEventListener("DOMContentLoaded", async () => {
  localizePage();
  document.title = t("optTitle");
  fill(await getSettings());
});
