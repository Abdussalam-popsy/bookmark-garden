/**
 * Content script — runs on https://x.com/i/bookmarks*
 *
 * On START_INDEXING:
 *   1. Injects a progress overlay into the page
 *   2. Scroll loop — parse visible tweets → deduplicate → scroll → repeat
 *   3. Flushes to IndexedDB every FLUSH_BATCH_SIZE tweets so progress is
 *      preserved even if the tab is closed mid-run
 *   4. Stops after MAX_EMPTY_SCROLLS consecutive scrolls with no new tweets
 *      OR immediately when STOP_INDEXING is received from the popup/background
 */

import { isDev } from "@/lib/env";
import { parseAllVisibleTweets } from "./scraper";
import type { Bookmark } from "@/lib/db";
import type { ExtensionMessage } from "@/lib/messaging";

if (isDev) {
  console.warn("[Bookmark Garden] content script active on", window.location.href);
}

const SCROLL_DELAY_MS = 1500;
/** Full scan: be patient, tweets can be slow to appear at the end of the list */
const MAX_EMPTY_SCROLLS_FULL = 4;
/** Resume scan: once we've passed the resume point all remaining tweets are old — stop quickly */
const MAX_EMPTY_SCROLLS_RESUME = 2;
const FLUSH_BATCH_SIZE = 25; // write to DB after every N new tweets

/** Set to true when STOP_INDEXING is received; checked between scroll steps */
let stopRequested = false;

// Guard against double-registration when background injects this script
// programmatically into a tab that already has it from the manifest declaration.
if (!(globalThis as Record<string, unknown>).__bgContentLoaded) {
  (globalThis as Record<string, unknown>).__bgContentLoaded = true;

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "START_INDEXING") {
      stopRequested = false;
      const { resumeAfterTweetId } = message.payload;
      runIndexing(resumeAfterTweetId)
        .then((count) => sendResponse({ count }))
        .catch((err: unknown) => sendResponse({ error: String(err) }));
      return true;
    }

    if (message.type === "STOP_INDEXING") {
      stopRequested = true;
      sendResponse({ ok: true });
    }
  });
}

async function runIndexing(resumeAfterTweetId: string | null): Promise<number> {
  const overlay = createOverlay();
  const seen = new Set<string>(); // all tweet IDs encountered — for dedup only
  const pending: Bookmark[] = []; // net-new tweets queued for the next flush
  let savedTotal = 0;
  let totalNew = 0; // net-new tweets found this run (shown in overlay / returned)
  let emptyScrolls = 0;

  // BigInt for fast numeric Snowflake ID comparison; null = full scan
  const resumeId = resumeAfterTweetId !== null ? BigInt(resumeAfterTweetId) : null;
  const maxEmptyScrolls = resumeId !== null ? MAX_EMPTY_SCROLLS_RESUME : MAX_EMPTY_SCROLLS_FULL;

  async function flush() {
    if (pending.length === 0) return;
    const batch = pending.splice(0); // drain and clear
    try {
      const result = (await chrome.runtime.sendMessage({
        type: "SAVE_BOOKMARKS_BATCH",
        payload: batch,
      })) as { ok?: boolean; error?: string } | undefined;

      if (result?.error) throw new Error(result.error);

      savedTotal += batch.length;
      overlay.setSaved(savedTotal);
    } catch (err) {
      // Put them back so we can retry on the next flush
      pending.unshift(...batch);
      overlay.error(`Save failed: ${String(err)}`);
    }
  }

  while (emptyScrolls < maxEmptyScrolls) {
    const visible = parseAllVisibleTweets();
    // fresh = not seen this session (dedup across scrolls)
    const fresh = visible.filter((t) => !seen.has(t.id));
    // netNew = fresh tweets that are newer than the resume point (or all if full scan)
    const netNew: Bookmark[] = [];

    for (const tweet of fresh) {
      seen.add(tweet.id); // always track for dedup
      if (resumeId === null || BigInt(tweet.id) > resumeId) {
        netNew.push(tweet);
        pending.push(tweet);
      }
    }

    if (netNew.length > 0) {
      totalNew += netNew.length;
      emptyScrolls = 0;
      const oldest = netNew[netNew.length - 1];
      overlay.update(totalNew, oldest ? formatDate(oldest.bookmarkedAt) : "");

      if (pending.length >= FLUSH_BATCH_SIZE) {
        await flush();
      }
    } else {
      emptyScrolls++;
    }

    window.scrollBy(0, window.innerHeight);
    await sleep(SCROLL_DELAY_MS);

    if (stopRequested) break;
  }

  // Flush whatever was collected before the stop/natural end
  await flush();

  if (stopRequested) {
    overlay.stopped(totalNew);
  } else {
    overlay.done(totalNew);
  }
  return totalNew;
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
  setSaved: (saved: number) => void;
  done: (total: number) => void;
  stopped: (total: number) => void;
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

  const render = (html: string) => {
    el.innerHTML = html;
  };

  let _found = 0;
  let _saved = 0;
  let _position = "";

  function renderState() {
    render(
      `<b>Bookmark Garden</b><br>` +
        `Found <b>${_found}</b> · Saved <b>${_saved}</b>` +
        (_position ? `<br><span style="color:#8b98a5;font-size:11px">${_position}</span>` : "")
    );
  }

  renderState();

  return {
    update(count, position) {
      _found = count;
      _position = position;
      renderState();
    },
    setSaved(saved) {
      _saved = saved;
      renderState();
    },
    done(total) {
      render(
        `<b>Bookmark Garden</b><br>` +
          `Done — <b>${total}</b> bookmark${total !== 1 ? "s" : ""} saved ✓`
      );
      setTimeout(() => el.remove(), 5000);
    },
    stopped(total) {
      render(
        `<b>Bookmark Garden</b><br>` +
          `Stopped — <b>${total}</b> bookmark${total !== 1 ? "s" : ""} saved ✓`
      );
      setTimeout(() => el.remove(), 5000);
    },
    error(msg) {
      el.style.background = "#420c0c";
      render(`<b>Bookmark Garden</b><br><span style="color:#fca5a5">${msg}</span>`);
      setTimeout(() => el.remove(), 8000);
    },
  };
}
