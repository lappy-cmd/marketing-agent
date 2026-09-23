"use client";

import dynamic from "next/dynamic";
import { Spinner } from "./ui";

// Client-only: Studio restores saved form state from localStorage on first render.
const Studio = dynamic(() => import("./Studio"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">
      <Spinner className="h-6 w-6" />
    </div>
  ),
});

export function StudioLoader() {
  return <Studio />;
}
