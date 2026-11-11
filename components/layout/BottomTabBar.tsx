"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ScanFace, Sparkles, FileText, UserRound } from "lucide-react";

const tabs = [
  { href: "/", label: "홈", accessibleLabel: "홈", icon: Home },
  { href: "/diagnostic", label: "진단", accessibleLabel: "진단", icon: ScanFace },
  { href: "/catalog/products", label: "화장품", accessibleLabel: "화장품", icon: Sparkles },
  { href: "/catalog/procedures", label: "시술", accessibleLabel: "시술", icon: FileText },
  { href: "/mypage", label: "마이", accessibleLabel: "마이 페이지", icon: UserRound },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="fixed bottom-0 left-1/2 z-50 grid w-full max-w-[430px] -translate-x-1/2 grid-cols-5 border-t border-neutral-200 bg-surface px-2 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ href, label, accessibleLabel, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-label={accessibleLabel} aria-current={active ? "page" : undefined}
            className={`relative mx-1 my-2 flex min-h-14 min-w-11 flex-col items-center justify-center gap-1 break-keep rounded-xl text-xs font-medium ${active ? "bg-primary-50 text-primary-700" : "text-neutral-600 hover:bg-neutral-100"}`}>
            <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
            <span>{label}</span>
            {active && <span aria-hidden="true" className="absolute -bottom-1 h-0.5 w-4 rounded-full bg-primary-700" />}
          </Link>
        );
      })}
    </nav>
  );
}
