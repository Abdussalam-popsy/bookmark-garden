/**
 * IndexedDB schema via Dexie.
 *
 * Think of Dexie like a typed wrapper around IndexedDB —
 * it gives you async/await instead of the raw callback-based API.
 *
 * The string passed to `.stores()` defines the *indexes*, not every field.
 * Fields not listed are still stored; they just can't be queried directly.
 *
 * Index syntax quick reference:
 *   "id"      → primary key (manual)
 *   "++id"    → auto-increment primary key
 *   "&name"   → unique index
 *   "*tags"   → multi-entry index (array values are each indexed separately)
 */

import Dexie, { type EntityTable } from "dexie";

// ── Types ────────────────────────────────────────────────────────────────────

export type ContentType = "article" | "video" | "image" | "thread" | "code" | "note";

export interface MediaItem {
  type: "image" | "video";
  url: string;
  width?: number;
  height?: number;
  /** Video poster image URL, if type is "video" */
  posterUrl?: string;
  /** Duration string as displayed in the tweet ("0:42"), if available */
  duration?: string;
}

export interface ExternalLink {
  url: string;
  title?: string;
  description?: string;
  /** OG image URL */
  image?: string;
  siteName?: string;
}

export interface Bookmark {
  /** Tweet ID — stable across X's UI changes */
  id: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  media: MediaItem[];
  externalLink: ExternalLink | null;
  contentType: ContentType;
  tags: string[];
  collections: string[];
  /** Freeform notes added by the user */
  notes: string;
  bookmarkedAt: Date;
  indexedAt: Date;
  /** X's own folder/collection name, if any */
  xFolder: string | null;
}

export interface Tag {
  id?: number; // auto-increment, assigned by Dexie
  name: string;
  color: string;
}

export interface Collection {
  id?: number;
  name: string;
  createdAt: Date;
}

export interface Setting {
  key: string;
  value: unknown;
}

// ── Database class ───────────────────────────────────────────────────────────

class BookmarkGardenDB extends Dexie {
  bookmarks!: EntityTable<Bookmark, "id">;
  tags!: EntityTable<Tag, "id">;
  collections!: EntityTable<Collection, "id">;
  settings!: EntityTable<Setting, "key">;

  constructor() {
    super("BookmarkGarden");

    this.version(1).stores({
      // Primary key + indexed fields only.
      // *tags and *collections = multi-entry: each array element is indexed.
      bookmarks: "id, authorHandle, indexedAt, bookmarkedAt, contentType, *tags, *collections",
      tags: "++id, &name, color",
      collections: "++id, &name, createdAt",
      settings: "key",
    });
  }
}

export const db = new BookmarkGardenDB();
