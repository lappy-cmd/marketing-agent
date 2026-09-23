import { StudioLoader } from "@/components/StudioLoader";

export default function Home() {
  return (
    <main className="flex-1">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">M</div>
            <span className="font-semibold text-zinc-900">Marketing Agent</span>
          </div>
          <span className="text-sm text-zinc-500">Instagram carousel generator</span>
        </div>
      </header>
      <StudioLoader />
    </main>
  );
}
