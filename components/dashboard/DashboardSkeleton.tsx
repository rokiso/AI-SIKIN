export function DashboardSkeleton() {
  return (
    <section role="status" aria-live="polite" className="min-h-[560px] space-y-8 break-keep">
      <span className="sr-only">대시보드 정보를 불러오는 중입니다.</span>
      <div aria-hidden="true" className="space-y-8 motion-safe:animate-pulse">
        <div className="space-y-4"><div className="h-4 w-2/5 rounded-xl bg-neutral-200" /><div className="h-16 w-4/5 rounded-xl bg-neutral-200" /><div className="h-12 rounded-xl bg-neutral-100" /></div>
        <div className="h-64 rounded-2xl bg-neutral-100" />
        <div className="h-40 rounded-2xl bg-neutral-100" />
      </div>
    </section>
  );
}
