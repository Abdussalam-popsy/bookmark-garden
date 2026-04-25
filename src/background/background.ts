/**
 * Background service worker.
 *
 * Acts as a router: the popup can't talk directly to a content script
 * (different contexts), so messages flow popup → background → content script.
 *
 * MV3 service workers die when idle and revive on events — don't store
 * anything important in module-level variables. Use chrome.storage or
 * IndexedDB for persistent state.
 */

import { isDev } from "@/lib/env";
import type { ExtensionMessage } from "@/lib/messaging";

chrome.runtime.onInstalled.addListener((details) => {
  if (isDev) {
    console.warn("[Bookmark Garden] service worker installed, reason:", details.reason);
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "START_INDEXING") {
    // Must return true before doing any async work so Chrome keeps the
    // message channel open while we await the tab query.
    routeToBookmarksTab(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({ error: String(err) });
      });
    return true;
  }
});

async function routeToBookmarksTab(
  message: ExtensionMessage
): Promise<{ count?: number; error?: string }> {
  // Find an open tab on x.com/i/bookmarks — requires the "tabs" permission.
  const tabs = await chrome.tabs.query({ url: "https://x.com/i/bookmarks*" });

  if (tabs.length === 0 || !tabs[0].id) {
    // Don't auto-open — let the user navigate there intentionally so the
    // content script is fully loaded when they press Index.
    return { error: "Open x.com/i/bookmarks first, then click Index." };
  }

  const tabId = tabs[0].id;

  try {
    // Forward the message to the content script running on that tab.
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as { count: number };
  } catch {
    // sendMessage throws if the content script isn't injected yet
    // (e.g. the tab was open before the extension was loaded/reloaded).
    return {
      error: "Content script not ready — refresh x.com/i/bookmarks and try again.",
    };
  }
}
