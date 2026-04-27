/**
 * DOM scraper for x.com/i/bookmarks.
 *
 * X doesn't expose a bookmarks API for personal accounts, so we read the
 * rendered DOM. The trade-off: this will break when X changes their markup.
 * Mitigation: lean on stable data-testid attributes rather than class names,
 * which X resets every deploy. Expect to patch selectors 2-4 times a year.
 *
 * Entry points (public API):
 *   parseAllVisibleTweets()  — collect all articles currently in the DOM
 *   parseTweetElement(el)    — parse a single article element
 */

import type { Bookmark, ContentType, ExternalLink, MediaItem } from "@/lib/db";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse every tweet article currently rendered in the DOM.
 * Does NOT scroll — call this after each scroll step in the scrape loop.
 */
export function parseAllVisibleTweets(): Bookmark[] {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  const results: Bookmark[] = [];

  for (const el of articles) {
    const bookmark = parseTweetElement(el);
    if (bookmark) results.push(bookmark);
  }

  return results;
}

/**
 * Parse a single article[data-testid="tweet"] element into a Bookmark.
 * Returns null if the tweet ID or author can't be extracted — those are
 * required fields and without them we can't dedupe or attribute the record.
 */
export function parseTweetElement(el: Element): Bookmark | null {
  const id = extractTweetId(el);
  if (!id) return null;

  const author = extractAuthorInfo(el, id);
  if (!author) return null;

  const text = extractText(el);
  const media = extractMedia(el);
  const externalLink = extractExternalLink(el);
  const bookmarkedAt = extractTimestamp(el) ?? new Date();

  return {
    id,
    authorHandle: author.handle,
    authorName: author.name,
    authorAvatar: author.avatar,
    text,
    media,
    externalLink,
    contentType: classifyContent(media, externalLink, text, el),
    tags: [],
    collections: [],
    notes: "",
    bookmarkedAt,
    indexedAt: new Date(),
    xFolder: null,
  };
}

// ── Tweet ID ─────────────────────────────────────────────────────────────────

function extractTweetId(el: Element): string | null {
  // X always wraps the timestamp in a permalink anchor:
  //   <a href="/username/status/1234567890"><time datetime="...">...</time></a>
  // The tweet ID is the last path segment after /status/.
  const statusLink = el.querySelector('a[href*="/status/"]');
  const match = statusLink?.getAttribute("href")?.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

// ── Author ───────────────────────────────────────────────────────────────────

interface AuthorInfo {
  handle: string;
  name: string;
  avatar: string;
}

function extractAuthorInfo(el: Element, tweetId: string): AuthorInfo | null {
  // Derive handle from the same status link used for the tweet ID.
  // "/elonmusk/status/123" → split on "/" → index 1 = "elonmusk".
  // Far more reliable than parsing the display text, which can contain
  // verified badges, emoji, and multiple nested spans.
  const statusHref = el.querySelector(`a[href*="/status/${tweetId}"]`)?.getAttribute("href");
  const handle = statusHref?.split("/")?.[1];
  if (!handle) return null;

  // Display name: constrain the selector to the profile link for this handle
  // so we don't accidentally pick up the @handle span that follows.
  const nameEl = el.querySelector(`[data-testid="User-Name"] a[href="/${handle}"] span span`);
  const name = nameEl?.textContent?.trim() || handle;

  // Avatar: X profile images always hit pbs.twimg.com/profile_images/…
  // Tweet media uses /media/ — this discriminates cleanly.
  const avatarEl = el.querySelector('img[src*="profile_images"]');
  const avatar = avatarEl?.getAttribute("src") ?? "";

  return { handle, name, avatar };
}

// ── Text ─────────────────────────────────────────────────────────────────────

function extractText(el: Element): string {
  // X native articles replace tweetText with a distinct title element.
  // Use the headline as the text field so the card has meaningful content.
  const articleTitle = el.querySelector('[data-testid="twitter-article-title"]');
  if (articleTitle) {
    return articleTitle.textContent?.trim() ?? "";
  }
  // textContent gives us plain text — links show as their display label
  // (e.g. "github.com/…" not the full t.co URL), hashtags as "#tag", etc.
  return el.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? "";
}

// ── Media ────────────────────────────────────────────────────────────────────

function extractMedia(el: Element): MediaItem[] {
  const items: MediaItem[] = [];

  // Images — X wraps each photo in [data-testid="tweetPhoto"]
  // We filter to pbs.twimg.com/media URLs to exclude avatars and card thumbnails.
  const photoEls = el.querySelectorAll('[data-testid="tweetPhoto"] img');
  for (const img of photoEls) {
    const src = img.getAttribute("src") ?? "";
    if (!src.includes("pbs.twimg.com/media")) continue;
    const imgEl = img as HTMLImageElement;
    items.push({
      type: "image",
      url: src,
      // naturalWidth/Height are 0 until the image fully loads — store if available
      width: imgEl.naturalWidth || undefined,
      height: imgEl.naturalHeight || undefined,
    });
  }

  // Videos — both native video and GIFs render as <video> in X's player.
  const videoEl = el.querySelector("video");
  if (videoEl) {
    items.push({
      type: "video",
      url: videoEl.getAttribute("src") ?? "",
      posterUrl: videoEl.getAttribute("poster") ?? undefined,
      // Duration overlay doesn't have a stable data-testid yet; skip for now.
    });
  }

  return items;
}

// ── External link card ───────────────────────────────────────────────────────

function extractExternalLink(el: Element): ExternalLink | null {
  // Link preview cards render inside [data-testid="card.wrapper"].
  // Not every tweet has one.
  const card = el.querySelector('[data-testid="card.wrapper"]');
  if (!card) return null;

  // The card's outer anchor holds the destination URL.
  // (card.layoutSmall.detail is the inner text block, not the link itself)
  const anchor = card.querySelector("a[href]") as HTMLAnchorElement | null;
  const url = anchor?.href ?? "";
  if (!url) return null;

  // Title sits in the first meaningful span inside the detail area.
  // X uses both "layoutSmall" (1-image) and "layoutLarge" (big-image) variants.
  const detailEl =
    card.querySelector('[data-testid="card.layoutSmall.detail"]') ??
    card.querySelector('[data-testid="card.layoutLarge.detail"]');

  const textSpans = detailEl
    ? [...detailEl.querySelectorAll("span")]
        .map((s) => s.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 1)
    : [];

  // Card thumbnail (not a profile image — those are in profile_images CDN path)
  const thumbImg = card.querySelector('img[src]:not([src*="profile_images"])');
  const image = thumbImg?.getAttribute("src") ?? undefined;

  return {
    url,
    title: textSpans[0],
    image,
    // description and siteName: hard to extract from X's card DOM reliably.
    // We'll fill these in when the OG fetch phase lands.
  };
}

// ── Timestamp ────────────────────────────────────────────────────────────────

function extractTimestamp(el: Element): Date | null {
  // Every tweet has a <time datetime="ISO-8601-string"> element.
  const datetime = el.querySelector("time[datetime]")?.getAttribute("datetime");
  return datetime ? new Date(datetime) : null;
}

// ── Content classification ───────────────────────────────────────────────────

/**
 * Rule-based content type. Runs in order from most-specific to least.
 * This matches PRD §3.3 — LLM tagging is a V2 concern.
 */
function classifyContent(
  media: MediaItem[],
  externalLink: ExternalLink | null,
  text: string,
  el: Element
): ContentType {
  // 0. X native article — detected by its unique read-view container.
  //    Hero image (if present) is captured by extractMedia via tweetPhoto.
  //    Headline is captured by extractText via twitter-article-title.
  if (el.querySelector('[data-testid="twitterArticleReadView"]')) {
    return "article";
  }

  // 1. Any video element present → video (includes GIFs)
  if (el.querySelector("video") || media.some((m) => m.type === "video")) {
    return "video";
  }

  // 2. github.com link or fenced code block in text → code
  if (externalLink?.url?.includes("github.com") || /```/.test(text)) {
    return "code";
  }

  // 3. 2+ images with no external link → image/graphic post
  if (media.filter((m) => m.type === "image").length >= 2 && !externalLink) {
    return "image";
  }

  // 4. Link card with a title → article
  if (externalLink?.title) {
    return "article";
  }

  // 5. Thread signals: 🧵 emoji, word "thread", or a nested quoted tweet
  // (a quote tweet renders as a second [data-testid="tweet"] inside the outer one)
  if (/🧵|thread/i.test(text) || el.querySelectorAll('[data-testid="tweet"]').length > 1) {
    return "thread";
  }

  // 6. Single image + any external link → treat as article (image is the OG hero)
  if (media.length === 1 && externalLink) {
    return "article";
  }

  return "note";
}
