"use client";

import { useState } from "react";
import { Button, Input, Spinner } from "./ui";

// One instruction box for the whole post: text, images, colors, caption.
export function EditWithAI({
  editing,
  disabled,
  lastSummary,
  onSubmit,
  onUndo,
}: {
  editing: boolean;
  disabled: boolean;
  lastSummary?: string;
  onSubmit: (instruction: string) => Promise<boolean>;
  onUndo: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const blocked = editing || disabled || !instruction.trim();

  async function submit() {
    if (blocked) return;
    // Keep the instruction on failure so it can be retried.
    if (await onSubmit(instruction.trim())) setInstruction("");
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
      <span className="text-sm font-medium text-zinc-800">✨ Ask AI to change anything</span>
      <div className="flex gap-2">
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="“Make it darker”, “swap slide 3’s photo for something moodier”, “shorten the caption”…"
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <Button disabled={blocked} onClick={submit} className="shrink-0">
          {editing ? <Spinner /> : null} Apply
        </Button>
      </div>
      {lastSummary && !editing ? (
        <div className="flex items-start justify-between gap-3 text-xs text-zinc-600">
          <span>{lastSummary}</span>
          <button type="button" onClick={onUndo} className="shrink-0 font-medium text-zinc-900 underline hover:text-zinc-600">
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
