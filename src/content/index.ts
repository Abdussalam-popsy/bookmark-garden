/**
 * Content script — runs on https://x.com/i/bookmarks*
 *
 * This is the entry point for the DOM scraper. In this stub it just confirms
 * the script loaded. The actual scrape loop will live in ./scraper.ts, added
 * in the next phase.
 */

import { isDev } from "@/lib/env";

if (isDev) {
  // Only log in development so we don't spam the production console
  console.warn("[Bookmark Garden] content script active on", window.location.href);
}

// Placeholder: listen for messages from the background worker
// (wired up properly in messaging phase)
chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse) => {
  // TODO: handle START_INDEXING message
});
