import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <section role="status" aria-live="polite" className="space-y-6 py-6">
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        <div className="h-4 w-1/3 rounded-xl bg-neutral-200" />
        <div className="h-8 w-3/4 rounded-xl bg-neutral-200" />
        <div className="h-40 rounded-2xl bg-neutral-100" />
      </div>
      <p className="flex items-center gap-3 text-sm leading-relaxed text-neutral-600">
        <LoaderCircle aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0 motion-safe:animate-spin" />
        피부 데이터를 안전하게 불러오는 중입니다...
      </p>
    </section>
  );
}
