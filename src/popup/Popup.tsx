import React, { useEffect, useState } from "react";

type IndexStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export default function Popup() {
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ kind: "idle" });
  // undefined = still loading from storage; null = never indexed; string = resume point ID
  const [lastIndexedTweetId, setLastIndexedTweetId] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    chrome.storage.local
      .get("lastIndexedTweetId")
      .then((stored) => {
        setLastIndexedTweetId((stored.lastIndexedTweetId as string) ?? null);
      })
      .catch(() => setLastIndexedTweetId(null));
  }, []);

  const hasIndexed = typeof lastIndexedTweetId === "string";
  const isLoading = indexStatus.kind === "loading";

  async function handleOpenGallery() {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("src/gallery/gallery.html"),
    });
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

      // Refresh the resume point so the next click picks up the new high-water mark
      chrome.storage.local.get("lastIndexedTweetId").then((stored) => {
        setLastIndexedTweetId((stored.lastIndexedTweetId as string) ?? null);
      });
    } catch {
      setIndexStatus({ kind: "error", message: "Error. Is the bookmarks tab open?" });
    }
  }

  return (
    <div className="w-64 p-4 font-sans">
      <header className="mb-4 flex items-center gap-2">
        <span className="text-2xl">🌿</span>
        <h1 className="text-base font-semibold text-gray-900">Bookmark Garden</h1>
      </header>

      <div className="flex flex-col gap-2">
        {hasIndexed ? (
          <>
            <button
              onClick={() => handleIndex("resume")}
              disabled={isLoading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Scanning…" : "Index new bookmarks"}
            </button>
            <button
              onClick={() => handleIndex("full")}
              disabled={isLoading}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reindex all
            </button>
          </>
        ) : (
          <button
            onClick={() => handleIndex("full")}
            disabled={isLoading || lastIndexedTweetId === undefined}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Scanning…" : "Index bookmarks"}
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
