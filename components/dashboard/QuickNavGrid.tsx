import Link from "next/link";
import { ArrowUpRight, CalendarDays, FlaskConical, BookOpen } from "lucide-react";

const destinations = [
  { href: "/catalog/products", title: "맞춤 화장품 둘러보기", description: "내 피부와 성분을 기준으로", icon: FlaskConical },
  { href: "/catalog/procedures", title: "비급여 시술 정보 가이드", description: "원리와 가격 범위를 차분히", icon: BookOpen },
  { href: "/snapshot", title: "피부 기록 캘린더", description: "일상의 변화를 한 장씩", icon: CalendarDays },
];

export function QuickNavGrid() {
  return (
    <section aria-labelledby="dashboard-quicknav-heading" className="break-keep">
      <h2 id="dashboard-quicknav-heading" className="mb-4 text-lg font-semibold text-neutral-900">맞춤 관리 살펴보기</h2>
      <nav aria-label="맞춤 관리 바로가기" className="space-y-3">
        {destinations.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50">
            <Icon aria-hidden="true" size={22} strokeWidth={1.75} className="shrink-0 text-primary-700" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-neutral-900">{title}</span><span className="mt-1 block text-xs leading-relaxed text-neutral-600">{description}</span></span>
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 text-neutral-600" />
          </Link>
        ))}
      </nav>
    </section>
  );
}
