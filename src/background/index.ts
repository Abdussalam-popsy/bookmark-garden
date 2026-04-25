/**
 * Background service worker — MV3 equivalent of a background page.
 *
 * Responsibilities (once built out):
 *  - Receive bookmark data from the content script and write to Dexie
 *  - Fetch OG metadata for external links
 *  - Coordinate indexing state (progress, resume token)
 *
 * Service workers are event-driven and will be terminated by Chrome when idle.
 * Keep state in storage (chrome.storage.session / IndexedDB), not in-memory variables.
 */

import { isDev } from "@/lib/env";

chrome.runtime.onInstalled.addListener((details) => {
  if (isDev) {
    console.warn("[Bookmark Garden] service worker installed, reason:", details.reason);
  }
});

// Placeholder: handle messages from content script and popup
chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse) => {
  // TODO: route typed messages (SAVE_BOOKMARK, FETCH_OG, etc.)
  // Return true here if you need to send an async response
});
