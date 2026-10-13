"use strict";

/**
 * Shared settings/helpers. Loaded by the background script, the popup
 * and the options page.
 */

const DEFAULT_SETTINGS = Object.freeze({
  // --- Tab unloading -------------------------------------------------------
  autoDiscard: true,          // unload tabs that were not used for a while
  discardAfterMin: 20,        // ...after this many minutes of inactivity
  maxLoadedTabs: 12,          // keep at most N tabs loaded (0 = unlimited)
  discardMinimized: true,     // unload tabs of minimized windows
  discardOnStartup: false,    // unload every background tab at browser start

  // --- Protection rules ----------------------------------------------------
  protectPinned: true,
  protectAudible: true,       // tabs that are playing sound
  protectSharing: true,       // tabs using camera / microphone / screen
  whitelist: [],              // domains that are never unloaded

  // --- Browser tweaks (applied through WebExtension APIs) ------------------
  disablePrefetch: true,      // network prediction / DNS & link prefetch
  limitAnimations: true,      // play GIF/APNG animations only once
  disableHyperlinkAuditing: true, // <a ping> tracking requests

  // --- UI ------------------------------------------------------------------
  showBadge: true,            // number of unloaded tabs on the toolbar icon
  estMbPerTab: 120            // rough RAM estimate per unloaded tab (MB)
});

async function getSettings() {
  const stored = await browser.storage.local.get("settings");
  return Object.assign({}, DEFAULT_SETTINGS, stored.settings || {});
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = Object.assign(current, patch);
  await browser.storage.local.set({ settings: next });
  return next;
}

/** Normalises a user supplied domain: "https://www.Example.com/x" -> "example.com" */
function normalizeDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/^\*\./, "").replace(/^www\./, "");
  return s;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return "";
  }
}

function isWhitelisted(url, whitelist) {
  const host = hostOf(url);
  if (!host) return false;
  return whitelist.some((d) => d && (host === d || host.endsWith("." + d)));
}

function t(key, subs) {
  return browser.i18n.getMessage(key, subs) || key;
}

/** Fills elements marked with data-i18n / data-i18n-title. */
function localizePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = browser.i18n.getUILanguage();
}
