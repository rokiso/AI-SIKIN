"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function ConnectivityNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {!online && (
        <div className="flex items-start gap-3 break-keep border-b border-neutral-200 bg-status-warning-surface px-4 py-3 text-sm leading-relaxed text-status-warning">
          <WifiOff aria-hidden="true" className="mt-1 shrink-0" size={20} strokeWidth={1.75} />
          <div>
            <p className="font-semibold">인터넷 연결이 끊겼습니다.</p>
            <p>연결 상태를 확인한 후 다시 시도해 주세요.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-1 min-h-11 min-w-11 rounded-xl px-2 font-semibold underline underline-offset-4">다시 시도</button>
          </div>
        </div>
      )}
    </div>
  );
}
