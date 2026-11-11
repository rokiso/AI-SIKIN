"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";

export default function ErrorBoundary() {
  return (
    <section aria-labelledby="error-title" className="space-y-5 py-8">
      <CircleAlert aria-hidden="true" size={32} strokeWidth={1.75} className="text-status-danger" />
      <h1 id="error-title" className="text-xl font-semibold leading-relaxed">일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</h1>
      <p className="text-sm leading-relaxed text-neutral-600">문제가 계속되면 홈으로 돌아가 다시 시작해 주세요.</p>
      <div className="flex flex-col gap-3">
        <button type="button" className="button-primary" onClick={() => window.location.reload()}>새로고침</button>
        <Link href="/" className="button-secondary">홈으로 이동</Link>
      </div>
    </section>
  );
}
