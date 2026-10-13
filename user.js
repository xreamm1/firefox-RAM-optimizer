/******************************************************************************
 * RAM Optimizer — user.js
 *
 * Settings that WebExtensions are NOT allowed to change. Copy this file into
 * your Firefox profile folder (about:support → "Profile Folder" → Open Folder)
 * and restart Firefox. To undo: delete user.js and reset the prefs in
 * about:config (user.js re-applies its values on every start).
 *
 * Lines marked [AGGRESSIVE] save a lot of memory but have trade-offs —
 * they are commented out; uncomment only if you understand them.
 ******************************************************************************/

/*** 1. Built-in tab unloading ***/
user_pref("browser.tabs.unloadOnLowMemory", true);                 // unload tabs when system memory is low
user_pref("browser.tabs.min_inactive_duration_before_unload", 300000); // only tabs idle ≥ 5 min (ms)
user_pref("browser.low_commit_space_threshold_mb", 2048);          // Windows/macOS: treat <2 GB free as "low memory"
user_pref("browser.low_commit_space_threshold_percent", 20);       // Linux: treat <20% free as "low memory"

/*** 2. Session restore: don't load every tab at start ***/
user_pref("browser.sessionstore.restore_on_demand", true);
user_pref("browser.sessionstore.restore_pinned_tabs_on_demand", true);
user_pref("browser.sessionstore.interval", 60000);                 // write session every 60 s instead of 15 s
user_pref("browser.sessionstore.max_tabs_undo", 10);
user_pref("browser.sessionstore.max_windows_undo", 1);

/*** 3. History / back-forward cache ***/
user_pref("browser.sessionhistory.max_total_viewers", 0);         // no in-memory bfcache of pages (big RAM win, "Back" reloads)
user_pref("browser.sessionhistory.max_entries", 15);              // back/forward history per tab (default 50)

/*** 4. Memory cache ***/
user_pref("browser.cache.memory.capacity", 65536);                // 64 MB memory cache (default: auto, can be much larger)
user_pref("browser.cache.memory.max_entry_size", 5120);           // max 5 MB per entry
user_pref("media.memory_cache_max_size", 16384);                  // 16 MB media cache

/*** 5. Prefetching / speculative loading ***/
user_pref("network.prefetch-next", false);
user_pref("network.dns.disablePrefetch", true);
user_pref("network.dns.disablePrefetchFromHTTPS", true);
user_pref("network.predictor.enabled", false);
user_pref("network.predictor.enable-prefetch", false);
user_pref("network.http.speculative-parallel-limit", 0);
user_pref("browser.places.speculativeConnect.enabled", false);
user_pref("browser.urlbar.speculativeConnect.enabled", false);

/*** 6. Background features that eat memory/CPU ***/
user_pref("extensions.pocket.enabled", false);
user_pref("reader.parse-on-load.enabled", false);
user_pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
user_pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
user_pref("browser.newtabpage.activity-stream.telemetry", false);
user_pref("browser.newtabpage.activity-stream.showSponsored", false);
user_pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
user_pref("browser.newtabpage.activity-stream.feeds.snippets", false);
user_pref("browser.ml.enable", false);                            // local AI features (Firefox 130+)
user_pref("browser.ml.chat.enabled", false);

/*** 7. Telemetry & studies ***/
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("toolkit.telemetry.archive.enabled", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("app.shield.optoutstudies.enabled", false);
user_pref("app.normandy.enabled", false);
user_pref("browser.ping-centre.telemetry", false);

/*** 8. Animations ***/
user_pref("image.animation_mode", "once");                        // GIFs play once

/*** 9. [AGGRESSIVE] Fewer content processes ***/
// Every site gets its own process with Fission; fewer processes = less RAM,
// but one heavy/crashing site can affect more tabs.
// user_pref("dom.ipc.processCount", 4);                          // shared web content processes (default 8)
// user_pref("dom.ipc.processCount.webIsolated", 1);              // processes per site (default 1–4)
// user_pref("dom.ipc.keepProcessesAlive.web", 0);                // don't keep spare processes alive
// user_pref("dom.ipc.processPrelaunch.enabled", false);          // don't pre-launch a spare process

/*** 10. [AGGRESSIVE] Very large savings, real downsides ***/
// user_pref("fission.autostart", false);                         // disables site isolation — WEAKER SECURITY
// user_pref("accessibility.force_disabled", 1);                  // breaks screen readers / assistive tech
// user_pref("browser.translations.enable", false);               // disables built-in page translation
// user_pref("gfx.webrender.software", true);                     // CPU rendering: less VRAM, more CPU
