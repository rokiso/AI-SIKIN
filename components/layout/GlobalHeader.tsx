"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowLeft, Leaf } from "lucide-react";

export function GlobalHeader({ navigationDisabled = false }: { navigationDisabled?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = useRef({ path: pathname, index: 0 });

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const state: unknown = event.state;
      navigation.current.index = typeof state === "object" && state !== null &&
        "sikinIndex" in state && typeof state.sikinIndex === "number" &&
        Number.isSafeInteger(state.sikinIndex) && state.sikinIndex > 0 ? state.sikinIndex : 0;
      navigation.current.path = window.location.pathname;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (navigation.current.path !== pathname) {
      navigation.current.index += 1;
      navigation.current.path = pathname;
    }
    // Keep Next.js's history metadata. Mark our entries so direct arrivals can
    // return home instead of leaving the app; popstate preserves Back/Forward.
    const state: unknown = window.history.state;
    const previous = typeof state === "object" && state !== null ? state : {};
    window.history.replaceState({ ...previous, sikinIndex: navigation.current.index }, "");
  }, [pathname]);

  function goBack() {
    if (navigation.current.index > 0) router.back();
    else router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 flex min-h-20 items-center justify-between border-b border-neutral-200 bg-surface px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex min-w-0 items-center gap-1">
        {pathname !== "/" && (
          <button type="button" disabled={navigationDisabled} onClick={goBack} aria-label="이전 페이지로 이동" className="icon-button -ml-2">
            <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.75} />
          </button>
        )}
        <Link href="/" aria-disabled={navigationDisabled} tabIndex={navigationDisabled ? -1 : undefined} onClick={(event) => { if (navigationDisabled) event.preventDefault(); }} aria-label="SIKIN 홈으로 이동" className="flex min-h-11 min-w-11 items-center gap-2 break-keep rounded-xl pr-2 font-semibold tracking-widest text-primary-800">
          <Leaf aria-hidden="true" size={23} strokeWidth={1.75} />
          <span className="text-lg">SIKIN</span>
        </Link>
      </div>
      <span className="break-keep text-xs font-medium text-neutral-600">내 피부의 기준</span>
    </header>
  );
}
