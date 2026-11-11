"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { safeReturnPath } from "@/lib/auth/validation";
const resultSchema = z.object({
  success: z.literal(true),
  data: z.object({ redirectUrl: z.string() }),
});
export function OAuthCallback({ provider }: { provider: string }) {
  const request = useRef<Promise<string> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!request.current) {
      const query = new URLSearchParams(window.location.search);
      const code = query.get("code");
      const state = query.get("state");
      // Remove authorization codes from browser history before any further navigation.
      window.history.replaceState(null, "", window.location.pathname);
      request.current = (async () => {
        if (!code || !state || query.has("error") || !["google", "kakao"].includes(provider))
          throw new Error("Login cancelled");
        const response = await fetch(`/api/v1/auth/callback/${provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
          signal: AbortSignal.timeout(20000),
        });
        const result = resultSchema.safeParse(await response.json());
        if (!response.ok || !result.success) throw new Error("Login failed");
        return safeReturnPath(result.data.data.redirectUrl);
      })();
    }
    void request.current.then(
      (path) => {
        if (active) window.location.replace(path);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [provider]);
  if (failed)
    return (
      <section role="alert" className="space-y-4">
        <h1 className="text-xl font-semibold">로그인하지 못했어요</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          로그인을 취소했거나 인증 시간이 지났습니다. 다시 로그인해 주세요.
        </p>
        <Link className="button-primary" href="/auth/login">
          다시 로그인하기
        </Link>
      </section>
    );
  return (
    <div role="status" className="flex items-center gap-3">
      <LoaderCircle aria-hidden="true" className="shrink-0 motion-safe:animate-spin" />
      <p>안전하게 로그인하고 있어요. 잠시만 기다려 주세요.</p>
    </div>
  );
}
