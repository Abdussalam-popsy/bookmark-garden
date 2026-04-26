/**
 * Background service worker.
 *
 * Acts as a router and data writer:
 *   - Routes START_INDEXING from popup → content script on the bookmarks tab
 *   - Handles SAVE_BOOKMARKS_BATCH from content script → writes to IndexedDB
 *
 * MV3 service workers die when idle and revive on events — don't store
 * anything important in module-level variables. Use chrome.storage or
 * IndexedDB for persistent state.
 */

import { isDev } from "@/lib/env";
import { db } from "@/lib/db";
import type { Bookmark } from "@/lib/db";
import type { ExtensionMessage } from "@/lib/messaging";

chrome.runtime.onInstalled.addListener((details) => {
  if (isDev) {
    console.warn("[Bookmark Garden] service worker installed, reason:", details.reason);
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "START_INDEXING") {
    routeToBookmarksTab(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({ error: String(err) });
      });
    return true;
  }

  if (message.type === "SAVE_BOOKMARKS_BATCH") {
    saveBatch(message.payload)
      .then((count) => sendResponse({ ok: true, count }))
      .catch((err: unknown) => sendResponse({ error: String(err) }));
    return true;
  }

  if (message.type === "STOP_INDEXING") {
    forwardStopToBookmarksTab()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "UPDATE_BOOKMARK_TAGS") {
    const { id, tags } = message.payload;
    db.bookmarks
      .update(id, { tags })
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ error: String(err) }));
    return true;
  }
});

async function forwardStopToBookmarksTab(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://x.com/i/bookmarks*" });
  if (tabs[0]?.id) {
    await chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_INDEXING" }).catch(() => {});
  }
}

async function routeToBookmarksTab(
  message: ExtensionMessage
): Promise<{ count?: number; error?: string }> {
  const tabs = await chrome.tabs.query({ url: "https://x.com/i/bookmarks*" });

  if (tabs.length === 0 || !tabs[0].id) {
    return { error: "Open x.com/i/bookmarks first, then click Index." };
  }

  const tabId = tabs[0].id;

  // x.com is a SPA — navigating to /i/bookmarks via the sidebar doesn't
  // trigger a real page load, so Chrome's manifest-based content script
  // injection may never fire. Inject programmatically every time to be safe.
  // The content script guards against double-registration internally.
  const contentScriptFile = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0];
  if (contentScriptFile) {
    await chrome.scripting
      .executeScript({
        target: { tabId },
        files: [contentScriptFile],
      })
      .catch(() => {}); // silently ignore if tab is not injectable
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as { count: number };
  } catch {
    return {
      error: "Content script not ready — refresh x.com/i/bookmarks and try again.",
    };
  }
}

async function saveBatch(bookmarks: Bookmark[]): Promise<number> {
  // chrome.runtime.sendMessage uses structured clone, but defensively
  // reconstruct Date objects in case serialisation collapsed them to strings.
  const records = bookmarks.map((bm) => ({
    ...bm,
    bookmarkedAt: new Date(bm.bookmarkedAt),
    indexedAt: new Date(bm.indexedAt),
  }));

  await db.bookmarks.bulkPut(records);
  await updateLastIndexedId(records.map((r) => r.id));

  if (isDev) {
    console.warn(`[Bookmark Garden] saved ${records.length} bookmarks to IndexedDB`);
  }

  return records.length;
}

/**
 * Keep chrome.storage.local["lastIndexedTweetId"] pointing to the highest
 * (newest) tweet ID we've successfully saved. Uses Snowflake ID numeric
 * ordering — higher ID = newer tweet, monotonically increasing.
 */
async function updateLastIndexedId(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const batchMax = ids.reduce((max, id) => {
    const bid = BigInt(id);
    return bid > max ? bid : max;
  }, BigInt(0));

  const stored = await chrome.storage.local.get("lastIndexedTweetId");
  const storedMax = stored.lastIndexedTweetId
    ? BigInt(stored.lastIndexedTweetId as string)
    : BigInt(0);

  if (batchMax > storedMax) {
    await chrome.storage.local.set({ lastIndexedTweetId: batchMax.toString() });
  }
}
