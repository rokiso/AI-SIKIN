"use client";
import { useState } from "react";
import type { OnUploadCompletePayload } from "@/lib/api/diagnosticUploadClient";
import { AlbumImageUploader } from "./AlbumImageUploader";
export function DiagnosticPhotoStep() {
  const [upload, setUpload] = useState<OnUploadCompletePayload | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  return (
    <>
      <AlbumImageUploader
        onUploadComplete={(result) => {
          setUpload(result);
          if (!result) setShowGuide(false);
        }}
      />
      {upload && (
        <section
          aria-labelledby="questionnaire-next-heading"
          className="mt-5 space-y-3 rounded-2xl bg-primary-50 p-5"
        >
          <h2 id="questionnaire-next-heading" className="text-base font-semibold text-primary-800">
            다음은 피부 습관을 살펴볼 차례예요
          </h2>
          <p className="text-sm leading-relaxed text-neutral-700">
            사진 등록이 끝났어요. 문진에서 평소 피부 상태와 습관을 함께 확인해요.
          </p>
          <button
            type="button"
            className="button-primary w-full"
            onClick={() => setShowGuide(true)}
            disabled={showGuide}
          >
            다음 단계로 이동
          </button>
          {showGuide && (
            <div role="status" className="space-y-2 text-sm leading-relaxed text-neutral-700">
              <h3 className="font-semibold">문진 안내</h3>
              <p>
                12문항 문진 기능은 준비 중이에요. 등록한 사진 정보는 현재 화면에서 유지되며, 문진이
                연결되면 이어서 사용할 수 있어요.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
