/**
 * Content script — runs on https://x.com/i/bookmarks*
 *
 * On START_INDEXING:
 *   1. Injects a progress overlay into the page
 *   2. Scroll loop — parse visible tweets → deduplicate → scroll → repeat
 *   3. Flushes to IndexedDB every FLUSH_BATCH_SIZE tweets so progress is
 *      preserved even if the tab is closed mid-run
 *   4. Stops after MAX_EMPTY_SCROLLS consecutive scrolls with no new tweets
 */

import { isDev } from "@/lib/env";
import { parseAllVisibleTweets } from "./scraper";
import type { Bookmark } from "@/lib/db";
import type { ExtensionMessage } from "@/lib/messaging";

if (isDev) {
  console.warn("[Bookmark Garden] content script active on", window.location.href);
}

const SCROLL_DELAY_MS = 1500;
const MAX_EMPTY_SCROLLS = 4;
const FLUSH_BATCH_SIZE = 25; // write to DB after every N new tweets

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "START_INDEXING") {
      runIndexing()
        .then((count) => sendResponse({ count }))
        .catch((err: unknown) => sendResponse({ error: String(err) }));
      return true;
    }
  }
);

async function runIndexing(): Promise<number> {
  const overlay = createOverlay();
  const seen = new Set<string>();
  const pending: Bookmark[] = []; // collected since last flush
  let savedTotal = 0;
  let emptyScrolls = 0;

  async function flush() {
    if (pending.length === 0) return;
    const batch = pending.splice(0); // drain and clear
    try {
      await chrome.runtime.sendMessage({ type: "SAVE_BOOKMARKS_BATCH", payload: batch });
      savedTotal += batch.length;
      if (isDev) console.warn(`[Bookmark Garden] flushed ${batch.length} → ${savedTotal} total saved`);
    } catch (err) {
      // Put them back so we can retry on the next flush
      pending.unshift(...batch);
      console.error("[Bookmark Garden] flush failed", err);
    }
  }

  while (emptyScrolls < MAX_EMPTY_SCROLLS) {
    const visible = parseAllVisibleTweets();
    const fresh = visible.filter((t) => !seen.has(t.id));

    for (const tweet of fresh) {
      seen.add(tweet.id);
      pending.push(tweet);
    }

    if (fresh.length > 0) {
      emptyScrolls = 0;
      const oldest = visible[visible.length - 1];
      overlay.update(seen.size, oldest ? formatDate(oldest.bookmarkedAt) : "");

      if (pending.length >= FLUSH_BATCH_SIZE) {
        await flush();
      }

      if (isDev) {
        console.warn(`[Bookmark Garden] +${fresh.length} (${seen.size} seen, ${savedTotal} saved)`);
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

  // Flush any remainder
  await flush();

  overlay.done(seen.size);
  return seen.size;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Progress overlay ──────────────────────────────────────────────────────────

interface Overlay {
  update: (count: number, position: string) => void;
  done: (total: number) => void;
  error: (msg: string) => void;
}

function createOverlay(): Overlay {
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

  const render = (html: string) => { el.innerHTML = html; };

  render("<b>Bookmark Garden</b><br>Starting…");

  return {
    update(count, position) {
      render(
        `<b>Bookmark Garden</b><br>Indexing… <b>${count}</b> found` +
          (position ? `<br><span style="color:#8b98a5;font-size:11px">${position}</span>` : "")
      );
    },
    done(total) {
      render(`<b>Bookmark Garden</b><br>Done — <b>${total}</b> bookmark${total !== 1 ? "s" : ""} saved`);
      setTimeout(() => el.remove(), 5000);
    },
    error(msg) {
      el.style.background = "#420c0c";
      render(`<b>Bookmark Garden</b><br><span style="color:#fca5a5">${msg}</span>`);
      setTimeout(() => el.remove(), 6000);
    },
  };
}
