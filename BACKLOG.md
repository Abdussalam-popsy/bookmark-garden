# Bookmark Garden — Backlog

Append-only. Add new items to the appropriate section. Move items to CHANGELOG.md when shipped.

Shipped items removed from this file: Search (Fuse.js, S8), Tagging (S8), Sort by date (S7), Export/Import .bookmarkgarden (S9).

---

## Up next

Items to build in the next 1–2 sessions, in order.

- **Virtual scrolling / performance** — only render cards visible in the viewport. At 6000+ records the gallery is already lagging. `react-window` or `@tanstack/react-virtual`. No data changes needed — pure render optimisation.

- **Notes UI** — `notes` field already exists on every `Bookmark` record in Dexie. Needs: a textarea in the tag/detail modal, and write-back via a new `UPDATE_BOOKMARK_NOTES` message (gallery → background → `db.bookmarks.update(id, { notes })`).

- **Date range filter** — filter gallery by year, month, or date range. "Show me everything I saved in January 2024." `bookmarkedAt` is already indexed so queries are cheap. UI: a year/month picker in the header, or a start/end date input.

- **Gallery persistence across extension reload** — when the gallery tab is open, set `galleryOpen: true` in `chrome.storage.local` on mount. Background checks this flag on `onInstalled`/`onStartup` and re-opens the gallery tab automatically. Clears the flag on unload.

---

## Soon

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
