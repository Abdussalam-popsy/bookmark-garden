# X Bookmarks Organizer — PRD & Architecture

A browser extension that scrapes your X bookmarks, classifies them, and renders a Pinterest-style gallery you control.

---

## 1. Goals & non-goals

**Goals**

- Capture every bookmark on the X bookmarks page, including historical ones, without using the X API.
- Display them in a media-forward, scroll-to-get-inspired layout.
- Auto-classify by content type (article, video, design, thread, code, graphic) using DOM signals only.
- Let you filter, search, tag, and create your own collections.
- Keep all data local-first so the tool works offline and you own everything.
- Be extendable so you can layer LLM tagging on later if you want.

**Non-goals (V1)**

- Posting, replying, or any write actions on X.
- Multi-user accounts or sync across devices.
- LLM tagging (deferred to V2 — rules first).
- Mobile. This is a desktop browser extension only.

---

## 2. Users & use cases

You, primarily. Maybe friends later via Chrome Web Store unlisted link.

Core use cases:

- **Inspiration scroll** — open the gallery, see a masonry grid of saved designs/graphics/videos, get unstuck.
- **Find that thing** — search "Rive animation" and surface everything tagged or matching, regardless of original folder.
- **Triage** — review newly added bookmarks weekly, assign tags, move to collections.
- **Read later, properly** — articles get pulled into a readable list with link previews instead of being lost in tweet form.

---

## 3. Functional requirements

### 3.1 Indexing

- One-click "Index all bookmarks" action that opens or focuses the X bookmarks tab and auto-scrolls.
- Scroll loop: scroll by viewport, wait for new tweets to render, capture them, continue until N consecutive scrolls produce no new tweets.
- Throttling: configurable delay (default 800ms between scroll steps) to avoid rate-limiting and rendering glitches.
- Resumable: if interrupted, next run picks up where it stopped using the last seen tweet ID.
- Incremental mode: subsequent runs scroll only until they hit a known tweet ID, then stop.
- Progress UI: floating overlay showing "X bookmarks indexed, currently at [date]".

### 3.2 Data captured per bookmark

- Tweet ID, author handle, author display name, author avatar URL.
- Tweet text (full).
- Media: image URLs, video poster URLs, video duration if visible.
- External link URL + OG metadata (title, description, site name, hero image) fetched separately.
- Original X folder/collection if the bookmark is in one.
- Timestamp of tweet, timestamp of indexing.
- Reply context (is this part of a thread? quote tweet?).

### 3.3 Classification (rule-based, V1)

Content type is assigned by inspecting tweet structure:

- `<video>` element present → **video**.
- External link card with article-style OG metadata → **article**.
- 2+ images, no external link → **graphic/design**.
- Code block formatting (monospace, github.com link) → **code**.
- Long text, self-replies linked → **thread**.
- Single image with link → fall back to **article**, image is the preview.
- Otherwise → **note**.

Topic tags from a keyword dictionary you define and edit (e.g. `figma`, `rive`, `tailwind`, `marathon`, `tajweed`).

### 3.4 Gallery UI

Separate extension page (`gallery.html`) opened in its own tab.

- Masonry grid of cards. Card content adapts to type — video shows poster + play icon, article shows OG image + title + domain, design shows image only with text on hover.
- Sidebar filters: content type, tags, original folder, date range.
- Top search bar: full-text over tweet text + author + tags + linked article titles.
- Sort: recently indexed, recently bookmarked, author, random (for inspiration mode).
- Click card → expanded modal with full tweet, all media, action buttons (open in X, open link, edit tags, move to collection).
- Custom collections: create, drag cards in, rename, delete. Independent of X folders.

### 3.5 Tagging & editing

- Inline tag pills on hover, click to add/remove.
- Bulk tag: select multiple cards, apply tag.
- Tag autocomplete from existing tag set.
- Edit notes: add your own freeform note per bookmark.

### 3.6 Export

- JSON export of entire library.
- CSV for spreadsheet view.
- Per-collection HTML export (for sharing a curated set).

---

## 4. Architecture

### 4.1 Component overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Extension                         │
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐              │
│  │ Content Script   │      │ Background       │              │
│  │ (runs on x.com/  │◄────►│ Service Worker   │              │
│  │  i/bookmarks)    │      │                  │              │
│  │                  │      │ - Coordinates    │              │
│  │ - Auto-scroll    │      │ - OG metadata    │              │
│  │ - DOM scrape     │      │   fetch          │              │
│  │ - Send to BG     │      │ - Storage writes │              │
│  └──────────────────┘      └────────┬─────────┘              │
│                                     │                        │
│                                     ▼                        │
│                            ┌──────────────────┐              │
│                            │ IndexedDB        │              │
│                            │ (local storage)  │              │
│                            └────────┬─────────┘              │
│                                     │                        │
│                                     ▼                        │
│                            ┌──────────────────┐              │
│                            │ Gallery Page     │              │
│                            │ (gallery.html)   │              │
│                            │                  │              │
│                            │ - React/Solid UI │              │
│                            │ - Masonry        │              │
│                            │ - Search/filter  │              │
│                            └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Manifest (V3, Chrome)

```json
{
  "manifest_version": 3,
  "name": "Bookmark Garden",
  "version": "0.1.0",
  "permissions": ["storage", "tabs", "scripting"],
  "host_permissions": ["https://x.com/*", "https://twitter.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://x.com/i/bookmarks*"],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_popup": "popup.html"
  },
  "web_accessible_resources": [
    {
      "resources": ["gallery.html"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### 4.3 Content script — scrape loop

Pseudocode:

```js
async function indexBookmarks({ incremental = false }) {
  const seen = new Set(await getKnownTweetIds());
  let stagnantScrolls = 0;
  const MAX_STAGNANT = 4;

  while (stagnantScrolls < MAX_STAGNANT) {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let newCount = 0;

    for (const el of articles) {
      const tweet = parseTweetElement(el);
      if (!tweet) continue;
      if (seen.has(tweet.id)) {
        if (incremental) return; // hit known territory, stop
        continue;
      }
      seen.add(tweet.id);
      await sendToBackground("SAVE_BOOKMARK", tweet);
      newCount++;
    }

    if (newCount === 0) stagnantScrolls++;
    else stagnantScrolls = 0;

    window.scrollBy(0, window.innerHeight * 0.8);
    await sleep(800);
  }
}
```

`parseTweetElement` reads the article DOM: author from the user link, text from the tweet text container, media from `img` and `video` tags, link cards from the card wrapper, tweet ID from the timestamp link.

### 4.4 IndexedDB schema

Use Dexie.js — much nicer than raw IndexedDB.

```js
db.version(1).stores({
  bookmarks:
    "id, authorHandle, indexedAt, bookmarkedAt, contentType, *tags, *collections",
  tags: "++id, &name, color",
  collections: "++id, &name, createdAt",
  settings: "key",
});
```

Bookmark record shape:

```ts
{
  id: '1234567890',
  authorHandle: 'username',
  authorName: 'Display Name',
  authorAvatar: 'https://...',
  text: 'tweet body...',
  media: [{ type: 'image', url: '...', width, height }],
  externalLink: { url, title, description, image, siteName } | null,
  contentType: 'article' | 'video' | 'design' | 'thread' | 'code' | 'note',
  tags: ['rive', 'animation'],
  collections: ['inspiration'],
  notes: '',
  bookmarkedAt: Date,
  indexedAt: Date,
  xFolder: 'Design refs' | null
}
```

### 4.5 Background worker — OG metadata fetch

When the content script captures a tweet with an external link, the background worker fetches the URL and parses OG tags:

```js
async function fetchOGMetadata(url) {
  const res = await fetch(url, { credentials: "omit" });
  const html = await res.text();
  // parse <meta property="og:..."> tags
  return { title, description, image, siteName };
}
```

CORS will block some sites. Acceptable fallback: use the tweet's own link card data, which X has already fetched and rendered into the DOM.

### 4.6 Gallery page

Stack: **Vite + React + Tailwind + Dexie**. Lightweight, no backend.

Layout libraries: **react-masonry-css** for the grid, **Fuse.js** for fuzzy search, **react-window** if you need virtualization at 5k+ bookmarks.

Pages/views:

- `/` — main gallery
- `/collections/:name` — single collection
- `/tags/:tag` — single tag
- `/article-mode` — article-only reading list view
- `/settings` — keyword dictionary editor, indexing controls, export

---

## 5. Tech stack summary

| Layer               | Choice                                         | Why                                      |
| ------------------- | ---------------------------------------------- | ---------------------------------------- |
| Extension framework | Manifest V3, vanilla JS for content/background | Lightweight, future-proof                |
| Build               | Vite + CRXJS plugin                            | Fastest extension dev loop               |
| Gallery UI          | React + Tailwind                               | Your existing skill                      |
| Storage             | IndexedDB via Dexie                            | Local-first, handles 10k+ records easily |
| Layout              | react-masonry-css                              | Pinterest grid out of the box            |
| Search              | Fuse.js                                        | Fuzzy search, no backend                 |
| Optional V2         | Claude API or local Ollama                     | Semantic tagging                         |

---

## 6. Constraints & risks

### 6.1 Technical

- **DOM brittleness.** X changes class names and structure occasionally. Selectors will break. Mitigation: rely on stable attributes like `data-testid="tweet"` where possible, log scrape failures, ship updates as needed. Realistically expect to patch the scraper 2–4 times a year.
- **Rate-limiting during indexing.** Aggressive scrolling can trigger soft throttles. Mitigation: 800ms+ delays, exponential backoff if tweet count stops growing for unrelated reasons.
- **Initial index is slow.** Years of bookmarks could take 20–40 minutes the first run. Mitigation: progress UI, runs in background tab, resumable if interrupted.
- **CORS for OG fetches.** Many sites block cross-origin fetches. Mitigation: fall back to X's own link card data, which is already in the DOM.
- **Media URL expiry.** X media URLs are sometimes signed and rotate. Mitigation: store the tweet ID; you can always re-fetch by re-indexing.
- **Bookmarks-only access.** The extension can only see bookmarks loaded into the DOM. Bookmarks deleted on X stay in your local DB until you remove them — could be a feature (your archive survives) or a bug (data drift). Add a "verify" mode that flags missing ones.

### 6.2 Policy & terms of service

- X's ToS prohibits "scraping" in ambiguous language. A personal-use extension that only reads your own logged-in data is in a gray zone — different from a server-side scraper hitting public profiles. Realistic risk: low for personal use, higher if you publish widely on the Chrome Web Store with marketing that says "scrape your bookmarks." Mitigation: frame it as "organize and back up _your_ bookmarks," keep it local-only, no server.
- Chrome Web Store review: extensions that automate interactions on third-party sites get extra scrutiny. You may need to justify the auto-scroll behavior. Firefox AMO is generally more permissive.

### 6.3 Cost

V1 is free to build and run.

- Domain: you already have one.
- Hosting: none needed, extension is self-contained.
- Chrome Web Store developer account: $5 one-time if you want to publish.
- Firefox add-on: free to publish.

V2 with LLM tagging:

- Claude API: roughly $0.003 per bookmark tagged with Haiku, less with caching. 5,000 bookmarks ≈ $15 one-time, then pennies for incremental.
- Or free with local Ollama running Llama 3.1 8B — slower but zero cost.

### 6.4 Time

Realistic build estimates given your skill level:

- Scraper + storage + basic list view: 1–2 weekends.
- Polished masonry gallery + search/filter: another weekend.
- Tagging UI + collections: another weekend.
- Total to a tool you'd actually use: ~3–4 weekends of focused work.

V2 (LLM tagging, polish, Chrome Web Store submission): another 2 weekends.

---

## 7. Build order

1. **Scaffold extension** with Vite + CRXJS. Manifest, content script stub, background stub, popup with one button.
2. **DOM scraper** — get one tweet parsed correctly, then loop. Log to console, no storage yet.
3. **Dexie storage** — wire up the schema, save scraped tweets, dedupe by ID.
4. **Auto-scroll loop** — make it run end-to-end on your real bookmarks. Tune delays.
5. **Gallery page** — basic React app reading from Dexie, rendering a list.
6. **Masonry layout** — replace list with grid, add card variants per content type.
7. **Rule-based classification** — content type tagging from DOM signals.
8. **Search + filter sidebar** — Fuse.js, type/tag/date filters.
9. **Tagging UI** — add/remove tags, keyword dictionary in settings.
10. **Collections** — create, assign, view.
11. **OG metadata fetch** — article previews.
12. **Polish** — empty states, loading states, error states, export.
13. **(V2) LLM tagging** — Claude API or Ollama, batch process untagged bookmarks.

Ship at step 6 to yourself. Live with it for a week before doing 7+.

---

## 8. Open questions

- Do you want this branded as a personal tool or as something shippable (which affects naming, polish, and how careful you have to be about ToS framing)?
- Firefox + Chrome from day one, or Chrome only first?
- For V2 tagging, Claude API or local Ollama? Trade-off is cost vs setup friction.
- Do you want to import existing bookmarks from other tools (Raindrop, Pocket) or is this X-only forever?
