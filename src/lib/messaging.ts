/**
 * Typed message-passing between extension contexts.
 *
 * Chrome's runtime.sendMessage API accepts any object, which makes it easy
 * to introduce typos or forget which messages exist. This module defines a
 * discriminated union of all messages so TypeScript catches mismatches at
 * compile time — like a typed event bus.
 *
 * Pattern:
 *   sendMessage({ type: "START_INDEXING", payload: { incremental: true } })
 *   // TS will error if "type" is unrecognised or "payload" shape is wrong
 */

import type { Bookmark } from "./db";

// ── Message definitions ──────────────────────────────────────────────────────

/** Popup → Background: kick off a scrape run */
export interface StartIndexingMessage {
  type: "START_INDEXING";
  payload: {
    mode: "resume" | "full";
    /** Highest tweet ID already indexed; null means start from scratch */
    resumeAfterTweetId: string | null;
  };
}

/** Content → Background: save one scraped bookmark */
export interface SaveBookmarkMessage {
  type: "SAVE_BOOKMARK";
  payload: Bookmark;
}

/** Content → Background: save all scraped bookmarks in one shot */
export interface SaveBookmarksBatchMessage {
  type: "SAVE_BOOKMARKS_BATCH";
  payload: Bookmark[];
}

/** Background → Content: cancel an in-progress scrape */
export interface StopIndexingMessage {
  type: "STOP_INDEXING";
}

/** Background → Popup/Gallery: live progress update */
export interface IndexingProgressMessage {
  type: "INDEXING_PROGRESS";
  payload: {
    indexed: number;
    /** Human-readable current position, e.g. "Mar 2023" */
    currentPosition: string;
  };
}

/** Gallery → Background: persist updated tags for a bookmark */
export interface UpdateBookmarkTagsMessage {
  type: "UPDATE_BOOKMARK_TAGS";
  payload: { id: string; tags: string[] };
}

/** Union of every message that can travel through the extension */
export type ExtensionMessage =
  | StartIndexingMessage
  | SaveBookmarkMessage
  | SaveBookmarksBatchMessage
  | StopIndexingMessage
  | IndexingProgressMessage
  | UpdateBookmarkTagsMessage;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Send a typed message to the background service worker.
 * Use this from content scripts and the popup.
 */
export function sendMessage(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Send a typed message to a specific tab (background → content script).
 */
export function sendMessageToTab(tabId: number, message: ExtensionMessage): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

/**
 * Register a typed message listener. Narrowing `message.type` in the
 * callback gives full type inference on `message.payload`.
 *
 * @example
 * onMessage((message) => {
 *   if (message.type === "SAVE_BOOKMARK") {
 *     // message.payload is inferred as Bookmark here
 *   }
 * });
 */
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender
  ) => void | boolean | Promise<unknown>
): void {
  chrome.runtime.onMessage.addListener(
    handler as Parameters<typeof chrome.runtime.onMessage.addListener>[0]
  );
}
