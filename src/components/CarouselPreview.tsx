"use client";

import { Spinner } from "./ui";

// Instagram-style viewer: one large 4:5 slide with arrows, plus a thumbnail strip.
export function CarouselPreview({
  images,
  selected,
  onSelect,
}: {
  images: (string | null)[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const current = images[selected];
  const canPrev = selected > 0;
  const canNext = selected < images.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto w-full max-w-[440px]">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-zinc-100 shadow-sm ring-1 ring-zinc-200">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt={`Slide ${selected + 1}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">
              <Spinner />
            </div>
          )}
        </div>
        {canPrev ? (
          <button
            type="button"
            onClick={() => onSelect(selected - 1)}
            className="absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-800 shadow-md hover:bg-white"
            aria-label="Previous slide"
          >
            ‹
          </button>
        ) : null}
        {canNext ? (
          <button
            type="button"
            onClick={() => onSelect(selected + 1)}
            className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-800 shadow-md hover:bg-white"
            aria-label="Next slide"
          >
            ›
          </button>
        ) : null}
      </div>

      <div className="flex justify-center gap-2">
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`relative aspect-[4/5] w-14 overflow-hidden rounded-md bg-zinc-100 ring-2 transition ${
              i === selected ? "ring-zinc-900" : "ring-transparent opacity-70 hover:opacity-100"
            }`}
            aria-label={`Show slide ${i + 1}`}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-zinc-400">
                <Spinner className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
