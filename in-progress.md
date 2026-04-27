# Bookmark Garden — In Progress

Last updated: 2026-04-26 (session 4)

---

## Current state

Extension is functional end-to-end. Indexing pipeline scrolls x.com/i/bookmarks, parses tweets into typed Bookmark records, flushes to IndexedDB every 25 tweets, and the gallery React app reads and renders them. Roughly ~1500 bookmarks indexed across runs (including a partial mid-session run reaching Sep 2025). No tagging, search, or sort yet. Next session starts immediately on resumable indexing — approach approved and fully documented in BACKLOG.md.

---

## What works

- Scroll loop with live overlay (Found N · Saved N, errors surfaced in red)
- DOM scraper: ID, handle, display name, avatar, text, media, link card, timestamp, content type
- IndexedDB writes via `bulkPut` — re-indexing is safe (upsert by tweet ID)
- Gallery: 4-column card grid, content-type filter tabs, Refresh button
- Build: `npm run dev` = `vite build --watch`, ~400ms rebuilds
- Load workflow: always **remove + reload** (not refresh) to avoid stale service worker

---

## Active blockers

None. Gallery is rendering. No known broken flows.

---

## Next session's focus

Resumable indexing is shipped. Test it: remove+reload extension, open x.com/i/bookmarks, click "Index bookmarks" (first run = full scan). After completion, popup should show "Index new bookmarks" + "Reindex all". Next feature: sort by date dropdown in gallery.

---

---

## Update — 2026-04-27 (sessions 5–13)

A lot has shipped since session 4. Capturing it here as a block rather than per-session — CHANGELOG.md has the full per-session detail.

### What's been built

**Indexing**
- Resumable indexing — first run does a full scan, subsequent runs index only new bookmarks since the last indexed tweet ID. Popup shows "Index new bookmarks" vs "Reindex all" depending on state.

**Gallery — filtering and search**
- Fuse.js full-text search bar (searches text, author, tags, notes)
- Sort dropdown: newest first / oldest first / recently indexed
- Content-type filter pills (all, article, video, design, thread, code, note) with live counts
- Free-form tag filter — violet pills in header, click to filter
- Collections filter row — sky-blue pills, only shown when imported collections exist
- Date range filter — year dropdown (populated from actual data), month picker appears after year selection, × to clear

**Gallery — data management**
- Export all bookmarks as `.bookmarkgarden` (JSON)
- Import `.bookmarkgarden` — modal prompts for collection name, bookmarks tagged with that collection, writes to Dexie via background message

**Gallery — card UX**
- Free-form tagging — "+ tag" button on each card opens a modal, chip input, saves via `UPDATE_BOOKMARK_TAGS` message, optimistic update (no reload)
- Per-content-type card treatments: article cards show a tinted link preview block (favicon + site name + headline); text-only cards (note, thread, code) show body text at 15px / 5-line clamp; image/video/design cards unchanged

**Scraper fix**
- X native article cards now scraped correctly — `extractText` checks for `[data-testid="twitter-article-title"]` first; `classifyContent` detects article card via `[data-testid="twitterArticleReadView"]`

**Performance**
- Virtual scrolling via `@tanstack/react-virtual` (`useWindowVirtualizer`) — only viewport-visible rows rendered. Column count derived from container width via ResizeObserver. `estimateSize: 400px` (deliberate over-estimate to prevent scroll jump). All filters compose before the virtualiser sees the list.
- Cards fixed at `h-[340px]` with `overflow-hidden` — uniform grid, no dead zones, content truncates to fit

### Current state (as of session 13)

Gallery is fast and usable at ~10k bookmarks. All filters compose correctly. Two pre-launch items checked off: virtual scrolling and content-aware layout. Remaining pre-launch gates: per-collection export, indexing reliability at scale (1000+ run), landing page, Store submission.

### Lessons learned

- **Dexie has a known issue reading from extension pages written by a service worker** — the gallery bypasses Dexie entirely and reads IndexedDB directly via raw `indexedDB.open()`. This is intentional and should not be "fixed" by switching back to Dexie in the gallery.
- **Always remove + reload the extension, never just refresh** — stale service worker survives a refresh and serves old background code. Burned time on this multiple times.
- **Virtual row height estimation: always over-estimate** — under-estimating `estimateSize` causes the scroll position to jump downward as real heights land. Over-estimating causes the scrollbar to correct upward, which is imperceptible.
- **X Article cards have no `[data-testid="tweetText"]`** — the scraper silently produced blank cards for articles until a specific fix. Any future scraper work should test against article cards explicitly.
- **`.bookmarkgarden` import does not update `lastIndexedTweetId`** — intentional. Imported bookmarks are foreign data; the incremental indexing cursor should only advance from native X scrapes.

---

## Data shape reference

### Bookmark record fields

| Field | Type | Indexed? | Notes |
|---|---|---|---|
| `id` | `string` | **primary key** | Tweet ID — stable, used for upsert |
| `authorHandle` | `string` | yes | e.g. `"naval"` |
| `authorName` | `string` | no | Display name |
| `authorAvatar` | `string` | no | Profile image URL |
| `text` | `string` | no | Full tweet text |
| `media` | `MediaItem[]` | no | Array of image/video objects |
| `externalLink` | `ExternalLink \| null` | no | Link card data |
| `contentType` | `ContentType` | yes | `"article" \| "video" \| "design" \| "thread" \| "code" \| "note"` |
| `tags` | `string[]` | yes (multi-entry) | Each tag indexed separately |
| `collections` | `string[]` | yes (multi-entry) | Each collection indexed separately |
| `notes` | `string` | no | Freeform user notes |
| `bookmarkedAt` | `Date` | yes | When bookmarked on X |
| `indexedAt` | `Date` | yes | When we scraped it |
| `xFolder` | `string \| null` | no | X's native folder name, if any |

**`MediaItem`** — `{ type: "image"|"video", url, width?, height?, posterUrl?, duration? }`

**`ExternalLink`** — `{ url, title?, description?, image?, siteName? }`

### What "indexed" means in practice

**Indexed fields** (`authorHandle`, `contentType`, `bookmarkedAt`, `indexedAt`, `tags`, `collections`) can be queried directly and cheaply:
```ts
db.bookmarks.where("contentType").equals("video").toArray()
db.bookmarks.where("authorHandle").equals("naval").toArray()
db.bookmarks.where("bookmarkedAt").between(start, end).toArray()
db.bookmarks.where("tags").equals("typography").toArray()
```

**Unindexed fields** (`text`, `authorName`, `media`, `externalLink`, `notes`, `xFolder`) require a full scan — load all records then filter in JS. Fine for 978 records, worth noting for search.

Date range filters (`bookmarkedAt`, `indexedAt`) are cheap and ideal for sort/filter UI. Author filtering is also cheap. Full-text search on `text` requires JS-side Fuse.js (full scan, acceptable at this scale).
