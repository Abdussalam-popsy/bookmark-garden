/**
 * Content script — runs on https://x.com/i/bookmarks*
 *
 * On START_INDEXING:
 *   1. Injects a progress overlay into the page
 *   2. Scroll loop — parse visible tweets → deduplicate → scroll down → repeat
 *   3. Stops after MAX_EMPTY_SCROLLS consecutive scrolls with no new tweets
 *   4. Sends one SAVE_BOOKMARKS_BATCH to the background to write all to IndexedDB
 *   5. Responds to the popup with the final count
 */

import { isDev } from "@/lib/env";
import { parseAllVisibleTweets } from "./scraper";
import type { Bookmark } from "@/lib/db";
import type { ExtensionMessage } from "@/lib/messaging";

if (isDev) {
  console.warn("[Bookmark Garden] content script active on", window.location.href);
}

/** ms to wait after each scroll for X to render new tweets */
const SCROLL_DELAY_MS = 1500;
/** Stop after this many consecutive scrolls that yield no new tweets */
const MAX_EMPTY_SCROLLS = 3;

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "START_INDEXING") {
    runIndexing()
      .then((count) => sendResponse({ count }))
      .catch((err: unknown) => sendResponse({ error: String(err) }));
    return true; // keep channel open for async response
  }
});

async function runIndexing(): Promise<number> {
  const overlay = createOverlay();

  // Map keyed by tweet ID — deduplicates across scroll steps
  const collected = new Map<string, Bookmark>();
  let emptyScrolls = 0;

  while (emptyScrolls < MAX_EMPTY_SCROLLS) {
    const visible = parseAllVisibleTweets();
    const fresh = visible.filter((t) => !collected.has(t.id));

    for (const tweet of fresh) {
      collected.set(tweet.id, tweet);
    }

    if (fresh.length > 0) {
      emptyScrolls = 0;
      // Use the last visible tweet (oldest on screen) as the position indicator
      const oldest = visible[visible.length - 1];
      const position = oldest ? formatDate(oldest.bookmarkedAt) : "";
      overlay.update(collected.size, position);

      if (isDev) {
        console.warn(
          `[Bookmark Garden] +${fresh.length} new tweets (${collected.size} total) @ ${position}`
        );
      }
    } else {
      emptyScrolls++;
      if (isDev) {
        console.warn(`[Bookmark Garden] empty scroll ${emptyScrolls}/${MAX_EMPTY_SCROLLS}`);
      }
    }

    window.scrollBy(0, window.innerHeight);
    await sleep(SCROLL_DELAY_MS);
  }

  const allBookmarks = [...collected.values()];

  if (allBookmarks.length > 0) {
    const result = (await chrome.runtime.sendMessage({
      type: "SAVE_BOOKMARKS_BATCH",
      payload: allBookmarks,
    })) as { ok?: boolean; error?: string } | undefined;

    if (result?.error) {
      overlay.error(result.error);
      throw new Error(result.error);
    }
  }

  overlay.done(allBookmarks.length);
  return allBookmarks.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

// ── Progress overlay ──────────────────────────────────────────────────────────

interface Overlay {
  update: (count: number, position: string) => void;
  done: (total: number) => void;
  error: (msg: string) => void;
}

function createOverlay(): Overlay {
  // Remove any stale overlay from a previous run
  document.getElementById("bg-overlay")?.remove();

  const el = document.createElement("div");
  el.id = "bg-overlay";
  el.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    "background:#15202b",
    "color:#e7e9ea",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:13px",
    "line-height:1.6",
    "padding:12px 16px",
    "border-radius:16px",
    "box-shadow:0 4px 24px rgba(0,0,0,0.6)",
    "border:1px solid rgba(255,255,255,0.08)",
    "min-width:220px",
    "pointer-events:none",
  ].join(";");

  document.body.appendChild(el);

  const render = (html: string) => {
    el.innerHTML = html;
  };

  render("<b>Bookmark Garden</b><br>Starting…");

  return {
    update(count, position) {
      render(
        `<b>Bookmark Garden</b><br>` +
          `Indexing… <b>${count}</b> found` +
          (position ? `<br><span style="color:#8b98a5;font-size:11px">${position}</span>` : "")
      );
    },
    done(total) {
      render(
        `<b>Bookmark Garden</b><br>` +
          `Done — <b>${total}</b> bookmark${total !== 1 ? "s" : ""} saved`
      );
      setTimeout(() => el.remove(), 5000);
    },
    error(msg) {
      el.style.background = "#420c0c";
      render(`<b>Bookmark Garden</b><br><span style="color:#fca5a5">${msg}</span>`);
      setTimeout(() => el.remove(), 6000);
    },
  };
}
