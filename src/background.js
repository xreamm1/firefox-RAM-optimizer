"use strict";

/* global DEFAULT_SETTINGS, getSettings, saveSettings, isWhitelisted, hostOf, normalizeDomain, t */

const ALARM_NAME = "ram-optimizer-tick";
const DISCARDABLE_SCHEMES = ["http:", "https:", "file:", "ftp:"];

// Tabs the user protected for the current session only (popup toggle).
// Stored in storage.session when available so it survives event-page restarts.
const sessionStore = browser.storage.session || null;
let memoryProtected = new Set();

/* ------------------------------------------------------------------------ */
/* Settings cache                                                           */
/* ------------------------------------------------------------------------ */

let settingsCache = null;

async function settings() {
  if (!settingsCache) settingsCache = await getSettings();
  return settingsCache;
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    settingsCache = null;
    settings().then((s) => {
      applyBrowserTweaks(s);
      updateBadge();
      enforceLimits("settings-changed");
    });
  }
});

/* ------------------------------------------------------------------------ */
/* Protected tabs (session)                                                 */
/* ------------------------------------------------------------------------ */

async function getProtectedTabs() {
  if (!sessionStore) return memoryProtected;
  const { protectedTabs } = await sessionStore.get("protectedTabs");
  return new Set(protectedTabs || []);
}

async function setTabProtected(tabId, value) {
  const set = await getProtectedTabs();
  if (value) set.add(tabId);
  else set.delete(tabId);
  if (sessionStore) await sessionStore.set({ protectedTabs: [...set] });
  else memoryProtected = set;
  return value;
}

browser.tabs.onRemoved.addListener((tabId) => {
  getProtectedTabs().then((set) => {
    if (set.has(tabId)) setTabProtected(tabId, false);
  });
  scheduleBadgeUpdate();
});

/* ------------------------------------------------------------------------ */
/* Stats                                                                    */
/* ------------------------------------------------------------------------ */

async function addToStats(count) {
  if (!count) return;
  const { stats } = await browser.storage.local.get("stats");
  const next = Object.assign({ discardedTotal: 0, since: Date.now() }, stats || {});
  next.discardedTotal += count;
  await browser.storage.local.set({ stats: next });
}

/* ------------------------------------------------------------------------ */
/* Discard logic                                                            */
/* ------------------------------------------------------------------------ */

function isDiscardableUrl(url) {
  try {
    return DISCARDABLE_SCHEMES.includes(new URL(url).protocol);
  } catch (e) {
    return false;
  }
}

/**
 * Returns a reason string if the tab must not be discarded, or null.
 * `ignoreActive` is used for explicit user actions on the current tab.
 */
function protectionReason(tab, s, protectedSet, { ignoreActive = false } = {}) {
  if (tab.discarded) return "already-discarded";
  if (tab.active && !ignoreActive) return "active";
  if (!isDiscardableUrl(tab.url)) return "special-page";
  if (protectedSet.has(tab.id)) return "protected";
  if (s.protectPinned && tab.pinned) return "pinned";
  if (s.protectAudible && tab.audible) return "audible";
  if (s.protectSharing && tab.sharingState &&
      (tab.sharingState.camera || tab.sharingState.microphone || tab.sharingState.screen)) {
    return "sharing";
  }
  if (isWhitelisted(tab.url, s.whitelist)) return "whitelisted";
  return null;
}

async function discardTabs(tabIds) {
  const ids = [...new Set(tabIds)];
  if (!ids.length) return 0;
  let done = 0;
  // Discard one by one so a single failing tab doesn't abort the whole batch.
  await Promise.all(ids.map(async (id) => {
    try {
      await browser.tabs.discard(id);
      done++;
    } catch (e) {
      console.debug("RAM Optimizer: cannot discard tab", id, e);
    }
  }));
  await addToStats(done);
  scheduleBadgeUpdate();
  return done;
}

async function candidateTabs(query, opts) {
  const [s, protectedSet, tabs] = await Promise.all([
    settings(), getProtectedTabs(), browser.tabs.query(query)
  ]);
  return tabs.filter((tab) => !protectionReason(tab, s, protectedSet, opts));
}

let enforcing = false;

/** Periodic / event driven enforcement of all automatic rules. */
async function enforceLimits(reason) {
  if (enforcing) return;
  enforcing = true;
  try {
    const s = await settings();
    const protectedSet = await getProtectedTabs();
    const allTabs = await browser.tabs.query({});
    const now = Date.now();
    const toDiscard = new Set();

    const eligible = allTabs.filter((tab) => !protectionReason(tab, s, protectedSet));

    // 1. Inactivity timeout.
    if (s.autoDiscard && s.discardAfterMin > 0) {
      const limit = s.discardAfterMin * 60 * 1000;
      for (const tab of eligible) {
        if (tab.lastAccessed && now - tab.lastAccessed >= limit) toDiscard.add(tab.id);
      }
    }

    // 2. Maximum number of loaded tabs (least recently used are unloaded first).
    if (s.maxLoadedTabs > 0) {
      const loaded = allTabs.filter((tab) => !tab.discarded && !toDiscard.has(tab.id));
      let excess = loaded.length - s.maxLoadedTabs;
      if (excess > 0) {
        const lru = eligible
          .filter((tab) => !toDiscard.has(tab.id))
          .sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
        for (const tab of lru) {
          if (excess-- <= 0) break;
          toDiscard.add(tab.id);
        }
      }
    }

    // 3. Minimized windows.
    if (s.discardMinimized) {
      const windows = await browser.windows.getAll();
      const minimized = new Set(windows.filter((w) => w.state === "minimized").map((w) => w.id));
      for (const tab of eligible) {
        if (minimized.has(tab.windowId)) toDiscard.add(tab.id);
      }
    }

    if (toDiscard.size) {
      const n = await discardTabs([...toDiscard]);
      console.debug(`RAM Optimizer (${reason}): unloaded ${n} tab(s)`);
    }
  } finally {
    enforcing = false;
  }
}

let enforceTimer = null;
function scheduleEnforce(reason, delay = 1500) {
  clearTimeout(enforceTimer);
  enforceTimer = setTimeout(() => enforceLimits(reason), delay);
}

/* ------------------------------------------------------------------------ */
/* User actions                                                             */
/* ------------------------------------------------------------------------ */

async function discardCurrentTab() {
  const [current] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!current) return 0;
  // Explicit action: only refuse for pages that physically can't be unloaded.
  if (current.discarded || !isDiscardableUrl(current.url)) return 0;

  // An active tab can't be discarded, so switch to the most recently used other tab.
  const others = (await browser.tabs.query({ currentWindow: true }))
    .filter((tab) => tab.id !== current.id && !tab.hidden)
    .sort((a, b) => {
      if (a.discarded !== b.discarded) return a.discarded ? 1 : -1;
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
  if (!others.length) {
    await browser.tabs.create({ windowId: current.windowId });
  } else {
    await browser.tabs.update(others[0].id, { active: true });
  }
  return discardTabs([current.id]);
}

async function discardOtherTabs() {
  const tabs = await candidateTabs({ currentWindow: true });
  return discardTabs(tabs.map((tab) => tab.id));
}

async function discardAllWindows() {
  const tabs = await candidateTabs({});
  return discardTabs(tabs.map((tab) => tab.id));
}

async function discardOtherWindows() {
  const current = await browser.windows.getCurrent();
  const tabs = (await candidateTabs({})).filter((tab) => tab.windowId !== current.id);
  return discardTabs(tabs.map((tab) => tab.id));
}

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch (e) {
    return url;
  }
}

async function closeDuplicateTabs() {
  const tabs = await browser.tabs.query({});
  const groups = new Map();
  for (const tab of tabs) {
    if (!tab.url || tab.url === "about:blank" || tab.url === "about:newtab") continue;
    const key = tab.cookieStoreId + "|" + canonicalUrl(tab.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }
  const toClose = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Keep active > pinned > most recently used.
    group.sort((a, b) =>
      (b.active - a.active) || (b.pinned - a.pinned) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
    for (const tab of group.slice(1)) {
      if (!tab.pinned && !tab.active) toClose.push(tab.id);
    }
  }
  if (toClose.length) await browser.tabs.remove(toClose);
  return toClose.length;
}

async function clearCache() {
  await browser.browsingData.removeCache({});
  return true;
}

async function toggleWhitelist(url) {
  const host = normalizeDomain(hostOf(url));
  if (!host) return null;
  const s = await settings();
  const list = new Set(s.whitelist);
  const nowListed = !list.has(host);
  if (nowListed) list.add(host);
  else list.delete(host);
  await saveSettings({ whitelist: [...list].sort() });
  return { host, whitelisted: nowListed };
}

/* ------------------------------------------------------------------------ */
/* Browser tweaks via privacy / browserSettings APIs                         */
/* ------------------------------------------------------------------------ */

async function setOrClear(setting, enabled, value) {
  if (!setting) return;
  try {
    if (enabled) await setting.set({ value });
    else await setting.clear({});
  } catch (e) {
    console.debug("RAM Optimizer: cannot change browser setting", e);
  }
}

async function applyBrowserTweaks(s) {
  const privacy = browser.privacy || {};
  const bs = browser.browserSettings || {};
  await Promise.all([
    setOrClear(privacy.network && privacy.network.networkPredictionEnabled, s.disablePrefetch, false),
    setOrClear(bs.imageAnimationBehavior, s.limitAnimations, "once"),
    setOrClear(privacy.websites && privacy.websites.hyperlinkAuditingEnabled, s.disableHyperlinkAuditing, false)
  ]);
}

/* ------------------------------------------------------------------------ */
/* Badge                                                                    */
/* ------------------------------------------------------------------------ */

async function updateBadge() {
  const s = await settings();
  if (!s.showBadge) {
    await browser.action.setBadgeText({ text: "" });
    return;
  }
  const discarded = await browser.tabs.query({ discarded: true });
  await browser.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  if (browser.action.setBadgeTextColor) await browser.action.setBadgeTextColor({ color: "#ffffff" });
  await browser.action.setBadgeText({ text: discarded.length ? String(discarded.length) : "" });
}

let badgeTimer = null;
function scheduleBadgeUpdate() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(updateBadge, 300);
}

/* ------------------------------------------------------------------------ */
/* Context menus                                                            */
/* ------------------------------------------------------------------------ */

function createMenus() {
  browser.menus.removeAll().then(() => {
    const contexts = ["tab", "action"];
    const items = [
      ["discard-current", "menuDiscardTab"],
      ["discard-others", "menuDiscardOthers"],
      ["discard-other-windows", "menuDiscardOtherWindows"],
      ["toggle-whitelist", "menuToggleWhitelist"]
    ];
    for (const [id, msg] of items) {
      browser.menus.create({ id, title: t(msg), contexts });
    }
  });
}

browser.menus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case "discard-current": {
      // From the tab strip the clicked tab may not be the active one.
      if (tab && !tab.active) {
        if (!tab.discarded && isDiscardableUrl(tab.url)) await discardTabs([tab.id]);
      } else {
        await discardCurrentTab();
      }
      break;
    }
    case "discard-others": return discardOtherTabs();
    case "discard-other-windows": return discardOtherWindows();
    case "toggle-whitelist": if (tab) return toggleWhitelist(tab.url);
  }
});

/* ------------------------------------------------------------------------ */
/* Keyboard commands                                                        */
/* ------------------------------------------------------------------------ */

browser.commands.onCommand.addListener((command) => {
  switch (command) {
    case "discard-current": return discardCurrentTab();
    case "discard-others": return discardOtherTabs();
    case "discard-all-windows": return discardAllWindows();
  }
});

/* ------------------------------------------------------------------------ */
/* Messages from popup / options                                            */
/* ------------------------------------------------------------------------ */

async function getStatus() {
  const [s, tabs, stored, protectedSet] = await Promise.all([
    settings(), browser.tabs.query({}), browser.storage.local.get("stats"), getProtectedTabs()
  ]);
  const [current] = await browser.tabs.query({ active: true, currentWindow: true });
  const discarded = tabs.filter((tab) => tab.discarded).length;
  return {
    total: tabs.length,
    discarded,
    loaded: tabs.length - discarded,
    estSavedMb: discarded * s.estMbPerTab,
    discardedTotal: (stored.stats && stored.stats.discardedTotal) || 0,
    settings: s,
    current: current ? {
      id: current.id,
      host: normalizeDomain(hostOf(current.url)),
      discardable: isDiscardableUrl(current.url),
      whitelisted: isWhitelisted(current.url, s.whitelist),
      protected: protectedSet.has(current.id)
    } : null
  };
}

browser.runtime.onMessage.addListener((msg) => {
  switch (msg && msg.cmd) {
    case "status": return getStatus();
    case "discardCurrent": return discardCurrentTab();
    case "discardOthers": return discardOtherTabs();
    case "discardAll": return discardAllWindows();
    case "discardOtherWindows": return discardOtherWindows();
    case "closeDuplicates": return closeDuplicateTabs();
    case "clearCache": return clearCache();
    case "toggleWhitelist": return toggleWhitelist(msg.url);
    case "setProtected": return setTabProtected(msg.tabId, !!msg.value);
    case "runNow": return enforceLimits("manual").then(() => true);
    case "resetStats":
      return browser.storage.local.set({ stats: { discardedTotal: 0, since: Date.now() } }).then(() => true);
    default: return undefined;
  }
});

/* ------------------------------------------------------------------------ */
/* Tab events                                                               */
/* ------------------------------------------------------------------------ */

browser.tabs.onCreated.addListener(() => {
  scheduleBadgeUpdate();
  scheduleEnforce("tab-created", 3000);
});

browser.tabs.onActivated.addListener(() => scheduleEnforce("tab-activated"));

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if ("discarded" in changeInfo) scheduleBadgeUpdate();
  if (changeInfo.status === "complete") scheduleEnforce("tab-loaded", 3000);
}, { properties: ["discarded", "status"] });

browser.windows.onFocusChanged.addListener(() => scheduleEnforce("window-focus", 2000));

/* ------------------------------------------------------------------------ */
/* Lifecycle                                                                */
/* ------------------------------------------------------------------------ */

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) enforceLimits("alarm");
});

async function ensureAlarm() {
  const existing = await browser.alarms.get(ALARM_NAME);
  if (!existing) browser.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

async function init() {
  await ensureAlarm();
  const s = await settings();
  await applyBrowserTweaks(s);
  await updateBadge();
}

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  createMenus();
  if (reason === "install") {
    await browser.storage.local.set({
      settings: Object.assign({}, DEFAULT_SETTINGS),
      stats: { discardedTotal: 0, since: Date.now() }
    });
  }
  await init();
});

browser.runtime.onStartup.addListener(async () => {
  createMenus();
  await init();
  const s = await settings();
  if (s.discardOnStartup) {
    // Give session restore a moment to create the tabs first.
    setTimeout(() => discardAllWindows(), 5000);
  }
});

init();
