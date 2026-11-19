"use client";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

export function GuestMigrationNotice() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="기록 연결 완료"
      className="flex items-start gap-2 border-b border-primary-200 bg-primary-50 px-4 py-3 text-sm leading-relaxed text-primary-900"
    >
      <Check aria-hidden="true" size={18} strokeWidth={1.75} className="mt-3 shrink-0" />
      <p className="flex-1 py-2">이전 진단 이력이 회원 계정으로 안전하게 연결되었습니다.</p>
      <button
        type="button"
        className="icon-button shrink-0"
        aria-label="연결 완료 안내 닫기"
        onClick={() => setVisible(false)}
      >
        <X aria-hidden="true" size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}
