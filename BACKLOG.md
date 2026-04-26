# Bookmark Garden — Backlog

Append-only. Add new items to the appropriate section. Move items to CHANGELOG.md when shipped.

---

## Up next

Items to build in the next 1–2 sessions, in order.

- **Stop / pause indexing** — popup "Stop" button that cancels an in-progress scan mid-run. Currently the scroll loop keeps going with no way to abort it. Background sends `STOP_INDEXING` to content script (message type already defined in `messaging.ts`); content script checks a flag each loop iteration and flushes remaining pending tweets before exiting cleanly.

- **Indexing progress visible everywhere** — popup shows live indexing status even when the x.com tab is in the background. Badge on the extension icon shows running count. State persisted in `chrome.storage.local` so it survives tab switches.

- **Sort & filter by date** — gallery sort dropdown: Newest first / Oldest first / Recently indexed. Date range filter (sidebar or inline). `bookmarkedAt` and `indexedAt` are both indexed so these queries are cheap.

- **View raw bookmark data** — "View raw" option on each card opens a modal showing the full JSON for that record. Lets me inspect what fields the scraper actually populated vs. left empty, which informs what filters and displays to build next.

---

## Soon

- **Search** — text input searches across `text`, `authorHandle`, `authorName`, `tags`, `notes`. Use Fuse.js for fuzzy matching. Full-scan is fine at current scale.

- **Tagging** — chip input on card detail modal, inline tag pills on cards, bulk-apply to multi-selected cards. Tags are already indexed in the schema.

- **Notes per bookmark** — freeform textarea on card detail modal. `notes` field already exists in schema, just needs UI.

- **Creator-first browsing** — sidebar list of all unique `authorHandle` values with bookmark counts. Click to filter gallery to that creator. Effectively automatic creator collections. `authorHandle` is indexed so grouping is cheap.

- **Tag management page** — list all tags with usage counts, rename, merge, delete.

- **Content type override** — ability to manually fix the auto-classified `contentType` on a card. Store override in the record via `bulkPut`.

- **Engagement metrics capture** — extend the scraper to pull like count, retweet count, reply count, and bookmark count from each tweet's action bar. Store as nullable numeric fields on the `Bookmark` record (`likes`, `retweets`, `replies`, `bookmarkCount`). These are snapshots from indexing time, not live. Schema migration: existing 978 records will have `null` on these fields until re-indexed.

- **Engagement metrics display** — toggle in gallery header (Show metrics / Hide metrics), persisted to `chrome.storage.local`. When on, show like/RT/reply counts as a compact row on each card. Sort options expand to include "Most liked" and "Most retweeted." Filter: "High engagement only" with a configurable threshold (e.g. > 500 likes).

---

## Later

- **Card variant styling** — sticky-note aesthetic for text-only notes, image-first layout for media tweets, video poster dominant for video cards.

- **Export to JSON** — full backup of all bookmarks as a single JSON file.

- **Import from JSON** — restore from backup or move between machines. Upsert into existing DB.

---

## Someday / maybe

- **LLM auto-tagging** — send `text` + `authorHandle` to Claude Haiku. Generate semantic tags: "typography," "iOS animation," "marathon advice." ~$0.003/bookmark with Haiku. Batch in background service worker.

- **OG metadata fetch** — for `externalLink` records with no `title`/`image`, fetch OG tags in background and backfill. Richer article cards.

- **Public landing page** — marketing page on absalom.dev describing the extension.

- **Chrome Web Store submission** — screenshots, description, privacy policy, review process.
