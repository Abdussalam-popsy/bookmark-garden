# Bookmark Garden — Changelog

Append-only. Most recent at top. Add entries when features ship.

---

## 2026-04-26 — Session 10

- **fix: X native article scraping** — X Articles rendered as blank cards because `[data-testid="tweetText"]` is absent on article cards. `extractText` now checks for `[data-testid="twitter-article-title"]` first and uses the article headline as the text field. `classifyContent` detects `[data-testid="twitterArticleReadView"]` (present only on X Article cards) as rule 0 and returns `"article"` immediately. Hero image was already captured by the existing `extractMedia` logic via `[data-testid="tweetPhoto"]`. Existing blank records require a re-scrape — no migration possible since the DOM signals were never stored.

---

## 2026-04-26 — Session 9

- **feat: export `.bookmarkgarden`** — "Export" button in gallery header serialises all bookmarks (main library + imported collections) to a JSON file downloaded as `bookmark-garden-YYYY-MM-DD.bookmarkgarden`. No new dependencies — pure Blob + URL.createObjectURL.
- **feat: import `.bookmarkgarden`** — "Import" button opens a file picker accepting `.bookmarkgarden` files. After file selection, a modal prompts for a collection name (filename pre-filled as default). Bookmarks are written to Dexie via a new `IMPORT_BOOKMARKS` background message (bulkPut — imported version wins on collision). Each imported bookmark gets `collections: ["Imported from <name>"]`. Import does NOT update `lastIndexedTweetId` so incremental X scans are unaffected.
- **feat: collections filter row** — gallery header shows a third filter row (sky-blue pills) whenever imported collections exist. Clicking a collection pill filters to only those bookmarks; clicking again or "All" resets. Composes with existing content-type and tag filters.

---

## 2026-04-26 — Session 8

- **feat: free-form tagging** — "+ tag" button on every card opens a modal. Chip input: Enter/comma adds a tag, × removes one, Backspace-on-empty removes the last. Tags saved to Dexie via `UPDATE_BOOKMARK_TAGS` message (gallery → background). Optimistic local state update — no reload needed. Existing tags shown as violet pills on cards and as filterable pills in the gallery header.

---

## 2026-04-26 — Session 8 (planning)

- **plan: approved roadmap for next builds**
  1. **Search** — Fuse.js full-text search bar in gallery header. Searches across `text`, `authorHandle`, `authorName`, `tags`, `notes`. Real-time, composes with content-type filter and sort dropdown.
  2. **Tagging** — free-form user-defined tags (e.g. "typography inspo", "really helpful"). Chip input on card detail panel. Write-back via new `UPDATE_BOOKMARK_TAGS` message type (gallery → background → Dexie `update()`). Tags filterable in gallery header. No predefined list — fully user-invented.
  3. **Export/import `.bookmarkgarden`** — future milestone. Export serialises all bookmarks + tags to a file with that extension. Import reads the file and merges into local DB as a named Collection.

---

## 2026-04-26 — Session 7

- **feat: sort by date** — gallery header now has a sort dropdown: Newest first / Oldest first / Recently indexed. Sorting is applied in render so switching is instant with no reload.
- **fix: SPA injection** — background now injects the content script programmatically via `scripting.executeScript` before every `sendMessage` call, fixing the "content script not ready" error caused by x.com's client-side navigation never triggering a real page load.

---

## 2026-04-26 — Session 6

- **feat: stop/cancel indexing** — popup shows a red "Stop indexing" button whenever a scan is in progress, replacing the normal index buttons. Clicking it sends `STOP_INDEXING` through the message bus (popup → background → content). Content script checks the flag after each scroll step, flushes any pending tweets, then exits cleanly. Overlay shows "Stopped — N bookmarks saved ✓". Everything saved before the stop is preserved.

---

## 2026-04-26 — Session 5

- **feat: resumable indexing** — popup now shows "Index new bookmarks" (resume mode) after first run, plus a "Reindex all" button for full re-scans. Background tracks `lastIndexedTweetId` in `chrome.storage.local` as the high-water mark (Snowflake ID BigInt comparison). Content script filters tweets by ID and stops after 2 consecutive empty scrolls once past the resume point (vs 4 for full scans). "Already up to date" message shown when nothing new is found.

---

## 2026-04-26 — Session 4

- **note: mid-flight partial index** — ran indexing during session; reached ~533 found / 514 saved at Sep 2025 before session close. Total bookmarks across all runs roughly ~1500. No resumable indexing yet — first run of that feature (next session) will fill any gaps from this partial run.
- **docs: restructure project docs** — split `in-progress.md` into current-state-only; created `BACKLOG.md` (prioritized feature queue) and `CHANGELOG.md` (this file). Added data shape reference to `in-progress.md`.
- **docs: approve resumable indexing design** — full approach documented in BACKLOG.md under "Resumable indexing." No code written yet; implementation is next session's first task.

---

## 2026-04-26 — Session 3

- **fix: gallery bundle not building** — `gallery.html` was only declared in `web_accessible_resources`, which CRXJS v2 copies verbatim without processing. Added `gallery.html` to `build.rollupOptions.input` in `vite.config.ts`. Vite now bundles the React app and rewrites the script src to `/assets/gallery-*.js`. Gallery mounts correctly. 978 bookmarks confirmed rendering.

---

## 2026-04-25 — Session 2

- **fix: gallery reads via raw IndexedDB** — bypassed Dexie in gallery context to avoid cross-context issues; reads directly via `indexedDB.open("BookmarkGarden")`.
- **fix: gallery sort and error state** — uses `toArray()` + JS sort (newest first), shows error state in UI instead of silently failing.
- **fix: overlay shows Found vs Saved separately** — surface flush errors visibly in the overlay (red), not just console.
- **fix: flush every 25 tweets** — previously saved all bookmarks in one shot at end of run. Now flushes to IndexedDB every 25 tweets. Progress is preserved if the tab is closed mid-run.
- **feat: gallery Refresh button** — gallery only loads on mount; Refresh button lets user reload after indexing completes.

---

## 2026-04-24 — Session 1

- **chore: dev script uses `vite build --watch`** — `vite dev` caused service worker CORS failures (CRXJS + Vite 8 incompatibility). Switched to `vite build --watch` for ~400ms incremental rebuilds.
- **feat: scroll loop, IndexedDB writes, gallery** — full end-to-end pipeline: scroll x.com/i/bookmarks, parse tweets, write to IndexedDB, render in gallery.
- **fix: rename entry files for CRXJS** — both entry files named `index.ts` caused CRXJS to load the content script bundle as the service worker. Renamed to `background.ts` / `content.ts`.
- **feat: wire message bus** — popup buttons (Index, Open gallery) are functional via typed `ExtensionMessage` union.
- **feat: DOM scraper** — `parseTweetElement()` extracts: tweet ID, author handle, display name, avatar, text, media (images + video + poster), link card, timestamp, content type classifier.
- **feat: Dexie schema + typed messaging** — `BookmarkGarden` DB with `bookmarks`, `tags`, `collections`, `settings` tables. Indexed fields: `authorHandle`, `indexedAt`, `bookmarkedAt`, `contentType`, `*tags`, `*collections`.
- **feat: popup and gallery React entry points** — popup with Index + Open Gallery buttons; gallery with card grid and content-type filter tabs.
- **feat: content script and background service worker stubs** — MV3 message routing scaffolded.
- **feat: Manifest V3** — permissions: `storage`, `tabs`, `scripting`. Host permissions: `x.com/*`, `twitter.com/*`.
- **chore: project scaffold** — Vite 8 + CRXJS 2.0.0 + React 19 + TypeScript strict + Tailwind CSS 3 + ESLint + Prettier.
