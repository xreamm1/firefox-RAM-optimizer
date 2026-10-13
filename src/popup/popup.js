"use strict";

/* global localizePage, saveSettings, t */

const $ = (id) => document.getElementById(id);
let status = null;

function send(cmd, extra) {
  return browser.runtime.sendMessage(Object.assign({ cmd }, extra));
}

function formatMb(mb) {
  return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB";
}

let toastTimer = null;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

async function refresh() {
  status = await send("status");
  $("stTotal").textContent = status.total;
  $("stLoaded").textContent = status.loaded;
  $("stDiscarded").textContent = status.discarded;
  $("stSaved").textContent = formatMb(status.estSavedMb);
  $("stAllTime").textContent = status.discardedTotal;
  $("autoDiscard").checked = status.settings.autoDiscard;

  const cur = status.current;
  const ok = cur && cur.discardable;
  $("siteBlock").hidden = !ok;
  $("notDiscardable").hidden = !!ok;
  $("discardCurrent").disabled = !ok;
  if (ok) {
    $("siteHost").textContent = cur.host;
    $("protectTab").checked = cur.protected;
    $("whitelistSite").checked = cur.whitelisted;
  }
}

function action(id, cmd, message) {
  $(id).addEventListener("click", async () => {
    $(id).disabled = true;
    try {
      const result = await send(cmd);
      toast(message(result));
    } finally {
      $(id).disabled = false;
      setTimeout(refresh, 400);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  localizePage();

  action("discardOthers", "discardOthers", (n) => t("doneDiscarded", [String(n)]));
  action("discardAll", "discardAll", (n) => t("doneDiscarded", [String(n)]));
  action("closeDuplicates", "closeDuplicates", (n) => t("doneClosed", [String(n)]));
  action("clearCache", "clearCache", () => t("doneCache"));

  $("discardCurrent").addEventListener("click", async () => {
    await send("discardCurrent");
    window.close();
  });

  $("autoDiscard").addEventListener("change", (e) => saveSettings({ autoDiscard: e.target.checked }));

  $("protectTab").addEventListener("change", (e) =>
    send("setProtected", { tabId: status.current.id, value: e.target.checked }));

  $("whitelistSite").addEventListener("change", async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await send("toggleWhitelist", { url: tab.url });
    refresh();
  });

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
    window.close();
  });

  refresh();
});
