# Bookmark Garden — Backlog

Append-only. Add new items to the appropriate section. Move items to CHANGELOG.md when shipped.

Shipped items removed from this file: Search (Fuse.js, S8), Tagging (S8), Sort by date (S7), Export/Import .bookmarkgarden (S9), Date range filter (S11).

---

## Pre-launch — must ship before Store submission

Non-negotiable quality bar. These gate the Chrome Web Store release.

- [x] **Virtual scrolling** — shipped S12. `@tanstack/react-virtual` with `useWindowVirtualizer`.
- [x] **Masonry / content-aware layout** — shipped S13. `items-start` grid, per-type card treatments (text-only 15px/5-line, article link block, image-first unchanged).
- [ ] **Per-collection export / sharing** — export a single collection as its own `.bookmarkgarden`. Core sharing primitive.
- [ ] **Indexing reliability** — long runs (1000+ bookmarks) without silent failure, dropped batches, or stalling. Needs field testing.
- [ ] **Landing page** — `absalom.dev` (or subdomain). Required for Store listing and word-of-mouth sharing.
- [ ] **Chrome Web Store submission** — screenshots, description, privacy policy, review process.

---

## Up next

Items to build in the next 1–2 sessions, in order.

- **Virtual scrolling / performance** — only render cards visible in the viewport. At 6000+ records the gallery is already lagging. `react-window` or `@tanstack/react-virtual`. No data changes needed — pure render optimisation.

- **Notes UI** — `notes` field already exists on every `Bookmark` record in Dexie. Needs: a textarea in the tag/detail modal, and write-back via a new `UPDATE_BOOKMARK_NOTES` message (gallery → background → `db.bookmarks.update(id, { notes })`).

- **Gallery persistence across extension reload** — when the gallery tab is open, set `galleryOpen: true` in `chrome.storage.local` on mount. Background checks this flag on `onInstalled`/`onStartup` and re-opens the gallery tab automatically. Clears the flag on unload.

---

## Soon

### Housekeeping (batch these in one session)

- **Delete individual bookmarks** — remove a single bookmark from the index permanently. Needs confirmation prompt. Add to card modal or card context menu.
- **Delete collections** — remove a named collection entirely. Bookmarks inside revert to uncollected (do not delete the bookmarks themselves). Needs confirmation prompt.
- **Export naming** — when exporting a collection, prompt for a custom filename. Default to `[collection-name]-[YYYY-MM-DD]` rather than a timestamp. Extension stays `.bookmarkgarden`.

- **Content-aware masonry layout** — two card variants based on content: (1) image/video-first: media dominates, text below; (2) text-only: full-width card, larger text, no empty image placeholder. Removes wasted whitespace and makes the gallery feel like a workshop, not a feed. Toggle between masonry and current uniform grid.

- **In-card article preview** — surface `externalLink.description` on article cards so users can read a preview without clicking through. Field is already in the `ExternalLink` schema, just not displayed. Scraper needs to populate it more reliably (currently left empty — OG fetch phase).

- **Per-collection export** — export a single named collection as its own `.bookmarkgarden` file instead of always exporting everything. Enables cleaner sharing: export "Pravin" → send file → collaborator imports it. UI: Export button becomes a dropdown when collections exist.

- **Creator filter / sidebar** — browse by `authorHandle`, see all bookmarks from a specific person. `authorHandle` is already indexed. Sidebar or a filter dropdown listing all unique authors with bookmark counts.

- **Import collection filter bug fix** — after importing on a fresh gallery (empty state), clicking the collection filter pill shows 0 results until Refresh is clicked. The optimistic state update is correct but something in the empty→populated render transition doesn't apply the filter. Needs investigation.

---

## Later

- **Indexing progress badge** — extension icon badge shows live running count during indexing. State in `chrome.storage.local` so it survives tab switches.

- **Content type override** — manually fix the auto-classified `contentType` on a card. Useful for the X Article blanks that need re-scraping and anything the classifier gets wrong.

- **Tag management page** — list all tags with usage counts, rename, merge, delete.

- **Engagement metrics** — extend scraper to capture likes, RTs, replies, bookmark count at index time (snapshot, not live). Display as a compact row on cards. Sort by "Most liked." Filter: "High engagement only" with configurable threshold.

- **View raw bookmark data** — "View raw" option on each card shows the full stored JSON. Useful for debugging scraper gaps.

---

## Someday / maybe

- **AI auto-tagging** — send `text` + `authorHandle` to Claude Haiku, generate semantic tags ("typography," "iOS animation," "system design"). Estimated ~$15 one-time for 5000+ bookmarks at Haiku pricing. Batch in background service worker. Tagging UI is solid enough to unlock this now — blocked only on API credits being set up.

- **OG metadata fetch** — for `externalLink` records missing `title`/`description`/`image`, fetch OG tags in background and backfill. Richer article card previews.

- **Chrome Web Store submission** — screenshots, description, privacy policy, review process.

- **Public landing page** — marketing page describing the extension.

- **AI chat interface** — bring-your-own API key; natural language queries over your bookmark index ("show me everything about typography from 2024", "what did I save about system design?"). RAG over the local IndexedDB corpus.

- **Obsidian sync** — export bookmarks as markdown files into a local vault directory. One `.md` per bookmark or per author, with frontmatter (tags, date, URL). Pairs with the per-collection export already in the backlog.

- **Resurface / second brain mode** — periodically surface old bookmarks you haven't revisited. Could be a daily notification, a "today's memory" card on gallery open, or a dedicated Resurface tab. Weighted toward older, untagged, or high-engagement bookmarks.

- **Multi-platform support** — scraper support for Instagram bookmarks and LinkedIn saves. Each platform needs its own scraper built from scratch (different DOM, different auth model). X must be stable and launched before touching this.

- **Swipe / focus view** — single-bookmark full-screen mode. Arrow or swipe through bookmarks one at a time. Natural fit for daily review and resurface mode. Removes distraction of the grid during active reading.

- **Daily review mode** — surface 10 bookmarks you haven't revisited in a while, presented in swipe/focus view. Spaced repetition for ideas. Pairs directly with resurface mode.

- **Reminders** — flag a bookmark as "read later" and get a notification or resurface prompt at a set time. Chrome alarms API + `chrome.notifications`.
