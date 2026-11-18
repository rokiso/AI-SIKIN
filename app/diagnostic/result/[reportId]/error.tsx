"use client";
import Link from "next/link";
export default function ReportError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">리포트를 불러오지 못했습니다</h1>
      <p role="alert" className="text-sm leading-relaxed text-neutral-700">
        일시적인 연결 문제일 수 있어요. 잠시 후 다시 시도해 주세요.
      </p>
      <button type="button" onClick={reset} className="button-primary w-full">
        다시 불러오기
      </button>
      <Link href="/mypage" className="button-secondary w-full">
        보관함으로
      </Link>
    </section>
  );
}
