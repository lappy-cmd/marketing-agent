"use client";

import { useRef, useState } from "react";
import { loadPhoto, type StudioPhoto } from "@/lib/photos";
import { MAX_PHOTOS } from "@/lib/schemas";
import { Spinner } from "./ui";

export function PhotoUploader({ photos, onChange }: { photos: StudioPhoto[]; onChange: (next: StudioPhoto[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (list.length > room) setError(`Up to ${MAX_PHOTOS} photos; added the first ${room}.`);
    if (room <= 0) return;
    setLoading(true);
    const added: StudioPhoto[] = [];
    for (const file of list.slice(0, room)) {
      try {
        added.push(await loadPhoto(file));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    onChange([...photos, ...added]);
    setLoading(false);
  }

  const update = (id: string, label: string) => onChange(photos.map((p) => (p.id === id ? { ...p, label } : p)));

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <div className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={p.label} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
              <input
                value={p.label}
                onChange={(e) => update(p.id, e.target.value)}
                placeholder="What is this?"
                maxLength={100}
                className="w-full rounded-md border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-zinc-900"
              />
            </div>
          ))}
        </div>
      ) : null}

      {photos.length < MAX_PHOTOS ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
            dragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
          }`}
        >
          {loading ? (
            <Spinner className="text-zinc-500" />
          ) : (
            <>
              <span className="text-sm font-medium text-zinc-800">📸 Add photos</span>
              <span className="text-xs text-zinc-500">
                Food, your place, products or app screenshots · {photos.length}/{MAX_PHOTOS}
              </span>
            </>
          )}
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {photos.length > 0 ? (
        <p className="text-xs text-zinc-500">
          Label photos (e.g. the restaurant name) so the AI puts each one on the right slide.
        </p>
      ) : null}
    </div>
  );
}
