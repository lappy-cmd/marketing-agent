"use client";

import { useState } from "react";
import { findImages } from "@/lib/client-api";
import type { ImageCandidate, ImageSource, ImageSources } from "@/lib/schemas";
import { Button, Input, Segmented, Spinner } from "./ui";

const KIND_LABELS: Record<ImageSource, string> = { stock: "Stock photos", web: "Web images" };

// Searches online for an image for one slide and lets the user pick one.
export function ImagePicker({
  defaultQuery,
  defaultKind,
  sources,
  onPick,
}: {
  defaultQuery: string;
  defaultKind: ImageSource;
  sources: ImageSources;
  onPick: (candidate: ImageCandidate, query: string) => Promise<void>;
}) {
  const kinds = (["stock", "web"] as const).filter((k) => sources[k]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [kind, setKind] = useState<ImageSource>(sources[defaultKind] ? defaultKind : (kinds[0] ?? "stock"));
  const [results, setResults] = useState<{ candidates: ImageCandidate[]; kindUsed: ImageSource } | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (kinds.length === 0) return null;

  async function search(nextKind = kind) {
    const q = query.trim();
    if (!q || searching) return;
    setError(null);
    setSearching(true);
    try {
      const found = await findImages(q, nextKind);
      setResults(found);
      if (found.candidates.length === 0) setError("No images found. Try different words.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function pick(candidate: ImageCandidate) {
    setError(null);
    setImporting(candidate.url);
    try {
      await onPick(candidate, query.trim());
      setOpen(false);
    } catch (e) {
      setError(`${(e as Error).message} Try another one.`);
    } finally {
      setImporting(null);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        className="self-start px-3 py-1.5 text-xs"
        onClick={() => {
          setOpen(true);
          if (!results) search();
        }}
      >
        🔎 Find images
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What should the image show?"
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <Button variant="secondary" disabled={searching || !query.trim()} onClick={() => search()} className="shrink-0">
          {searching ? <Spinner /> : "Search"}
        </Button>
      </div>

      {kinds.length > 1 ? (
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            search(k);
          }}
          options={kinds.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
        />
      ) : null}

      {results && results.candidates.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {results.candidates.map((c) => (
            <button
              key={c.url}
              type="button"
              disabled={importing !== null}
              onClick={() => pick(c)}
              title={c.author ? `${c.author} · ${c.sourceName}` : c.sourceName}
              className="group flex flex-col gap-1 text-left disabled:opacity-60"
            >
              <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-md bg-zinc-200 ring-zinc-900 group-hover:ring-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                {importing === c.url ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-zinc-700">
                    <Spinner />
                  </span>
                ) : null}
              </span>
              <span className="truncate text-[11px] text-zinc-500">{c.sourceName}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
        {results?.kindUsed === "stock" ? (
          <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline hover:text-zinc-800">
            Photos provided by Pexels
          </a>
        ) : (
          <span>Web images may be copyrighted. Check the source before posting.</span>
        )}
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 font-medium hover:text-zinc-900">
          Close
        </button>
      </div>
    </div>
  );
}
