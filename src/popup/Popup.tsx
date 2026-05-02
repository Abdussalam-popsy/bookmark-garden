import React, { useEffect, useState } from "react";
import logo from "../assets/icons/iconalpha.png";

type IndexStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

type Stats = {
  count: number;
  newestBookmarkedAt: Date | null;
  lastIndexedAt: Date | null;
};

function loadStats(): Promise<Stats> {
  return new Promise((resolve) => {
    const empty: Stats = { count: 0, newestBookmarkedAt: null, lastIndexedAt: null };
    const req = indexedDB.open("BookmarkGarden");
    req.onerror = () => resolve(empty);
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      resolve(empty);
    };
    req.onsuccess = () => {
      const idb = req.result;
      try {
        const tx = idb.transaction("bookmarks", "readonly");
        const all = tx.objectStore("bookmarks").getAll();
        all.onerror = () => {
          idb.close();
          resolve(empty);
        };
        all.onsuccess = () => {
          idb.close();
          const records = all.result as Array<{
            id: string;
            bookmarkedAt: Date | string;
            indexedAt: Date | string;
          }>;
          if (records.length === 0) {
            resolve(empty);
            return;
          }
          let maxRecord = records[0]!;
          let maxId = BigInt(records[0]!.id);
          for (const r of records) {
            const bid = BigInt(r.id);
            if (bid > maxId) {
              maxId = bid;
              maxRecord = r;
            }
          }
          resolve({
            count: records.length,
            newestBookmarkedAt: new Date(maxRecord.bookmarkedAt),
            lastIndexedAt: new Date(maxRecord.indexedAt),
          });
        };
      } catch {
        idb.close();
        resolve(empty);
      }
    };
  });
}

function timeAgo(date: Date): string {
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  const months = Math.floor(diffDays / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Popup() {
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ kind: "idle" });
  // undefined = still loading from storage; null = never indexed; string = resume point ID
  const [lastIndexedTweetId, setLastIndexedTweetId] = useState<string | null | undefined>(
    undefined
  );
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    chrome.storage.local
      .get("lastIndexedTweetId")
      .then((stored) => {
        setLastIndexedTweetId((stored.lastIndexedTweetId as string) ?? null);
      })
      .catch(() => setLastIndexedTweetId(null));
    loadStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const hasIndexed = typeof lastIndexedTweetId === "string";
  const isLoading = indexStatus.kind === "loading";

  async function handleOpenGallery() {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("src/gallery/gallery.html"),
    });
  }

  async function handleStop() {
    await chrome.runtime.sendMessage({ type: "STOP_INDEXING" }).catch(() => {});
  }

  async function handleIndex(mode: "resume" | "full") {
    setIndexStatus({ kind: "loading" });
    const resumeAfterTweetId = mode === "resume" ? (lastIndexedTweetId ?? null) : null;

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "START_INDEXING",
        payload: { mode, resumeAfterTweetId },
      })) as { count?: number; error?: string } | undefined;

      if (!response) {
        setIndexStatus({ kind: "error", message: "No response from background." });
        return;
      }
      if (response.error) {
        setIndexStatus({ kind: "error", message: response.error });
        return;
      }

      const count = response.count ?? 0;
      setIndexStatus({
        kind: "ok",
        message:
          count === 0
            ? "Already up to date — no new bookmarks found."
            : `Saved ${count} new bookmark${count !== 1 ? "s" : ""} to your garden.`,
      });

      // Refresh the resume point and stats so the next click picks up the new high-water mark
      chrome.storage.local.get("lastIndexedTweetId").then((stored) => {
        setLastIndexedTweetId((stored.lastIndexedTweetId as string) ?? null);
      });
      loadStats()
        .then(setStats)
        .catch(() => {});
    } catch {
      setIndexStatus({ kind: "error", message: "Error. Is the bookmarks tab open?" });
    }
  }

  return (
    <div className="w-64 p-4 font-sans">
      <header className="mb-4 flex items-center gap-2">
        <img src={logo} alt="Bookmark Garden" className="w-6 h-6 " />
        <h1 className="text-base font-semibold text-gray-900">Bookmark Garden</h1>
      </header>

      {stats !== null && stats.count > 0 && (
        <div className="mb-3 text-xs text-gray-400 leading-relaxed">
          <div>
            {stats.count.toLocaleString()} bookmarks
            {stats.lastIndexedAt && <span> · last indexed {timeAgo(stats.lastIndexedAt)}</span>}
          </div>
          {stats.newestBookmarkedAt && <div>Newest: {fmtDate(stats.newestBookmarkedAt)}</div>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isLoading ? (
          <button
            onClick={handleStop}
            className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Stop indexing
          </button>
        ) : hasIndexed ? (
          <>
            <button
              onClick={() => handleIndex("resume")}
              disabled={lastIndexedTweetId === undefined}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Index new bookmarks
            </button>
            <button
              onClick={() => handleIndex("full")}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Reindex all
            </button>
          </>
        ) : (
          <button
            onClick={() => handleIndex("full")}
            disabled={lastIndexedTweetId === undefined}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Index bookmarks
          </button>
        )}

        <button
          onClick={handleOpenGallery}
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Open gallery
        </button>
      </div>

      {/* Status feedback — only shown after an index attempt */}
      {indexStatus.kind === "ok" && (
        <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
          {indexStatus.message}
        </p>
      )}
      {indexStatus.kind === "error" && (
        <p className="mt-3 text-xs text-red-700 bg-red-50 rounded px-2 py-1">
          {indexStatus.message}
        </p>
      )}

      <p className="mt-4 text-center text-xs text-gray-400">v0.1.0 — local only</p>
    </div>
  );
}
