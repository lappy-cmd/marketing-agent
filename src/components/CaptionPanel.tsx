"use client";

import { useState } from "react";
import { Button, Textarea } from "./ui";

export function fullCaption(caption: string, hashtags: string[]) {
  return `${caption.trim()}\n\n${hashtags.join(" ")}`;
}

export function CaptionPanel({
  caption,
  hashtags,
  onChange,
}: {
  caption: string;
  hashtags: string[];
  onChange: (caption: string, hashtags: string[]) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullCaption(caption, hashtags));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure origin); the text is still selectable.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea rows={8} value={caption} onChange={(e) => onChange(e.target.value, hashtags)} />
      <div className="flex flex-wrap gap-1.5">
        {hashtags.map((h, i) => (
          <span key={i} className="group inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
            {h}
            <button
              type="button"
              onClick={() => onChange(caption, hashtags.filter((_, j) => j !== i))}
              className="text-zinc-400 hover:text-zinc-800"
              aria-label={`Remove ${h}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{caption.length} characters</span>
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied ✓" : "Copy caption + hashtags"}
        </Button>
      </div>
    </div>
  );
}
