"use client";
import { useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { z } from "zod";
import type { Provider } from "@/lib/auth/validation";

const authorizeResponse = z.object({
  success: z.literal(true),
  data: z.object({ authorizationUrl: z.url() }),
});
export function SocialLoginButtons({ returnPath }: { returnPath: string }) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  async function login(provider: Provider) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(provider);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/v1/auth/authorize/${provider}?redirect_url=${encodeURIComponent(returnPath)}`,
        { cache: "no-store", signal: AbortSignal.timeout(10000) },
      );
      const result = authorizeResponse.safeParse(await response.json());
      if (!response.ok || !result.success) throw new Error("Login unavailable");
      const url = new URL(result.data.data.authorizationUrl);
      if (
        url.protocol !== "https:" ||
        !["accounts.google.com", "kauth.kakao.com"].includes(url.hostname)
      )
        throw new Error("Invalid login destination");
      window.location.assign(url.href);
    } catch {
      setFailed(true);
      setPending(null);
      inFlight.current = false;
    }
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void login("kakao")}
        disabled={Boolean(pending)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-kakao px-5 py-3 text-sm font-semibold text-brand-kakao-text disabled:opacity-60"
      >
        {pending === "kakao" && (
          <LoaderCircle aria-hidden="true" size={18} className="motion-safe:animate-spin" />
        )}
        카카오로 로그인
      </button>
      <button
        type="button"
        onClick={() => void login("google")}
        disabled={Boolean(pending)}
        className="button-secondary w-full"
      >
        {pending === "google" && (
          <LoaderCircle aria-hidden="true" size={18} className="motion-safe:animate-spin" />
        )}
        Google로 로그인
      </button>
      {pending && (
        <p role="status" className="text-sm leading-relaxed text-neutral-600">
          안전한 로그인 페이지로 이동 중입니다...
        </p>
      )}
      {failed && (
        <div
          role="alert"
          className="rounded-xl bg-status-danger-surface p-4 text-sm leading-relaxed text-status-danger"
        >
          <p>로그인에 실패했습니다. 잠시 후 위 로그인 버튼을 눌러 다시 시도해 주세요.</p>
        </div>
      )}
    </div>
  );
}
export function SocialAuthModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  return (
    <>
      <button
        type="button"
        className="button-primary mt-4"
        onClick={() => dialog.current?.showModal()}
      >
        로그인하고 결과 보관하기
      </button>
      <dialog
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
            ),
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        aria-labelledby="social-login-heading"
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 text-neutral-900 backdrop:bg-neutral-950/50"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="social-login-heading" className="text-lg font-semibold">
            내 피부 관리 이어가기
          </h2>
          <button
            type="button"
            aria-label="로그인 창 닫기"
            className="icon-button shrink-0"
            onClick={() => dialog.current?.close()}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-neutral-600">
          소셜 계정으로 로그인하고 비회원으로 확인한 피부 분석 결과를 내 계정에 보관하세요.
        </p>
        <SocialLoginButtons returnPath={pathname} />
      </dialog>
    </>
  );
}
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      const result = z
        .object({ success: z.literal(true), data: z.object({ loggedOut: z.literal(true) }) })
        .safeParse(await response.json());
      if (!response.ok || !result.success) throw new Error("Logout failed");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        className="button-secondary"
        disabled={pending}
        onClick={() => void logout()}
      >
        {pending ? "로그아웃 중..." : "로그아웃"}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          로그아웃하지 못했습니다. 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
