/**
 * Content script — runs on https://x.com/i/bookmarks*
 *
 * Listens for START_INDEXING from the background worker, runs the DOM scraper
 * on whatever tweets are currently rendered, and logs the results so you can
 * inspect them in DevTools before trusting storage or the scroll loop.
 */

import { isDev } from "@/lib/env";
import { parseAllVisibleTweets } from "./scraper";
import type { ExtensionMessage } from "@/lib/messaging";

if (isDev) {
  console.warn("[Bookmark Garden] content script active on", window.location.href);
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "START_INDEXING") {
      const tweets = parseAllVisibleTweets();

      // Log every parsed tweet to the x.com page console so you can inspect
      // the shape before wiring storage. Open DevTools on the bookmarks tab
      // (not the popup — content script runs in the page context).
      console.warn(`[Bookmark Garden] Parsed ${tweets.length} tweet(s) from current view`);
      tweets.forEach((tweet, i) => {
        console.warn(`[Bookmark Garden] [${i + 1}/${tweets.length}]`, tweet);
      });

      // Respond synchronously — no async needed here yet
      sendResponse({ count: tweets.length });
      return false;
    }
  }
);
