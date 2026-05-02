# Bookmark Garden — Backlog

Append-only. Add new items to the appropriate section. Move items to CHANGELOG.md when shipped.

Shipped items removed from this file: Scaffold + message bus (S1), Scroll loop + gallery (S1–S2), Gallery bundle fix (S3), Resumable indexing (S5), Stop/cancel indexing (S6), SPA injection fix (S7), Sort by date (S7), Search/Fuse.js (S8), Free-form tagging (S8), Export/Import .bookmarkgarden (S9), X Article scraping fix (S10), Date range filter (S11), Virtual scrolling (S12), Content-aware card treatments (S13), Multi-select + bulk delete (S14), Per-collection export (S15), Tags→Collections migration + "design"→"image" rename + editable content type badge (S16), Collection context bar + universal export naming modal fix + trash icon on pills (S17).

Status note, 2026-05-01: older sections below are preserved for history, but the current priority order is now tracked in the "Current priority order" section. Items already shipped in CHANGELOG.md should not be treated as active backlog even if they still appear in older sections.

---

## Current priority order

### Near-term — prioritised for this weekend

- **UI & interaction polish pass** — card design, typography, spacing, and micro-interactions. This is the v2 launch face and the active sprint focus.

- **Onboarding card** — shown once on first popup open. Tells the user: indexing takes a while; you can stop and resume any time; already-indexed bookmarks are safe; you'll be notified when indexing is done.

- **Pinnable gallery tab** — register a stable internal Chrome URL so the gallery can be pinned as a tab and opened directly without going through the extension popup.

### Medium-term

- **Background indexing** — clicking index opens the X bookmarks tab and scrapes in the background. User can browse freely. Extension notifies when complete or if something goes wrong. User is never stuck babysitting a tab. Architecturally planned but deferred from this weekend sprint.

- **Chrome new tab override** — when opening a new tab, show 3-7 passively surfaced bookmarks from the library as a quiet recall prompt. Not the full gallery. Glance, remember something interesting, move on.

- **Link and website preview** — save any URL and preview it inline without leaving Bookmark Garden. Any link shared in the experience should be previewable. Ties into the core idea of never sending the user back to the original platform; applies to social platforms too, such as saved tweets/posts being previewable from the platform.

### Long-term / someday

- **Resurface mode / inspire me view + curation system** — algorithm surfaces bookmarks you haven't seen in a while using spaced repetition logic. Pairs with the new tab feature as the delivery mechanism. Includes a curation workflow for judging what stays and what goes: "This deserves to stay" / "This should go."

- **AI integration** — bring-your-own API key; natural language queries over your index, e.g. "show me my most interesting design saves from 2024."

- **Multi-platform scraping** — Instagram and LinkedIn using the same DOM scraping approach, with no API dependency so it can stay free/cheap.

- **Mobile access** — getting the gallery beyond the extension popup. Likely requires cloud sync as an opt-in later, not a core pivot.

---

## Pre-launch — must ship before Store submission

Non-negotiable quality bar. These gate the Chrome Web Store release.

- [x] **Virtual scrolling** — shipped S12. `@tanstack/react-virtual` with `useWindowVirtualizer`.
- [x] **Masonry / content-aware layout** — shipped S13. `items-start` grid, per-type card treatments (text-only 15px/5-line, article link block, image-first unchanged).
- [x] **Per-collection export / sharing** — shipped S15. Export icon on each collection pill in the header; naming modal, `.bookmarkgarden` download.
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

- **Notes UI** — `notes` field already exists on every `Bookmark` record in Dexie. Needs: a textarea in a card modal, and write-back via a new `UPDATE_BOOKMARK_NOTES` message (gallery → background → `db.bookmarks.update(id, { notes })`).

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

---

## Lessons learned

Operational gotchas confirmed across multiple sessions. Treat these as hard rules.

- **Dexie cross-context bug** — Dexie has a known issue reading from extension pages when the DB was written by a service worker. The gallery reads IndexedDB directly via raw `indexedDB.open("BookmarkGarden")`. This is intentional. Do not "fix" it by switching back to Dexie in the gallery.

- **Always remove + reload, never just refresh** — a stale service worker survives an extension refresh and keeps serving old background code. Always go to `chrome://extensions`, remove the extension, then Load unpacked again. Burned multiple sessions on this.

- **Virtual row `estimateSize`: always over-estimate** — `@tanstack/react-virtual` uses `estimateSize` before real heights are measured. Under-estimating causes scroll position to jump downward as real heights land. Over-estimating corrects upward, which is imperceptible. Current value: 400px.

- **X Article cards have no `[data-testid="tweetText"]`** — the scraper silently produced blank cards for all X Articles until an explicit fix was added (S10). Any future scraper work must be tested against article cards.

- **Import does not update `lastIndexedTweetId`** — intentional. Imported bookmarks are foreign data; the incremental indexing cursor must only advance from native X scrapes. Do not change this.

- **`npm run dev` = `vite build --watch`** — `vite dev` causes service worker CORS failures (CRXJS + Vite 8 incompatibility). The dev script runs `vite build --watch` for ~400ms incremental rebuilds.

---

## Data shape reference

### Bookmark record

| Field | Type | Indexed? | Notes |
|---|---|---|---|
| `id` | `string` | **primary key** | Tweet ID — stable, used for upsert |
| `authorHandle` | `string` | yes | e.g. `"naval"` |
| `authorName` | `string` | no | Display name |
| `authorAvatar` | `string` | no | Profile image URL |
| `text` | `string` | no | Full tweet text |
| `media` | `MediaItem[]` | no | Array of image/video objects |
| `externalLink` | `ExternalLink \| null` | no | Link card data |
| `contentType` | `ContentType` | yes | `"article" \| "video" \| "image" \| "thread" \| "code" \| "note"` |
| `tags` | `string[]` | yes (multi-entry) | Legacy — migrated into `collections` (S16). Should be empty on all records post-migration. |
| `collections` | `string[]` | yes (multi-entry) | Each collection indexed separately |
| `notes` | `string` | no | Freeform user notes |
| `bookmarkedAt` | `Date` | yes | When bookmarked on X |
| `indexedAt` | `Date` | yes | When we scraped it |
| `xFolder` | `string \| null` | no | X's native folder name, if any |

**`MediaItem`** — `{ type: "image" | "video", url, width?, height?, posterUrl?, duration? }`

**`ExternalLink`** — `{ url, title?, description?, image?, siteName? }`

### Indexed vs unindexed

**Indexed fields** (`authorHandle`, `contentType`, `bookmarkedAt`, `indexedAt`, `tags`, `collections`) can be queried directly and cheaply:
```ts
db.bookmarks.where("contentType").equals("video").toArray()
db.bookmarks.where("authorHandle").equals("naval").toArray()
db.bookmarks.where("bookmarkedAt").between(start, end).toArray()
db.bookmarks.where("collections").equals("design").toArray()
```

**Unindexed fields** (`text`, `authorName`, `media`, `externalLink`, `notes`, `xFolder`) require a full scan — load all records then filter in JS. Full-text search on `text` uses Fuse.js (acceptable at current scale).
