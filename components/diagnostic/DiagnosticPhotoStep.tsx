"use client";
import { useState } from "react";
import { useBiometricConsent } from "@/components/consent/BiometricConsentModal";
import type { OnUploadCompletePayload } from "@/lib/api/diagnosticUploadClient";
import { BaumannQuestionnaire } from "./BaumannQuestionnaire";
import { CameraViewfinder } from "./CameraViewfinder";
import { useUploadActivity } from "./UploadActivity";
import { AlbumImageUploader } from "./AlbumImageUploader";
export function DiagnosticPhotoStep() {
  const { busy } = useUploadActivity();
  const consent = useBiometricConsent();
  const [upload, setUpload] = useState<OnUploadCompletePayload | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [mode, setMode] = useState<"album" | "camera">("album");
  if (showGuide)
    return (
      <div className="mt-6">
        <BaumannQuestionnaire uploadSessionId={upload?.uploadSessionId} />
      </div>
    );
  return (
    <>
      {consent.modal}
      <button
        type="button"
        className="button-secondary mt-5 w-full"
        disabled={busy || consent.checking}
        onClick={() => setShowGuide(true)}
      >
        문진 먼저 시작하기
      </button>
      {mode === "camera" ? (
        <CameraViewfinder
          requestConsent={consent.requestConsent}
          onAlbum={() => setMode("album")}
          onUploadComplete={(result) => {
            setUpload(result);
            if (!result) setShowGuide(false);
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="button-secondary mt-5 w-full"
            disabled={busy || consent.checking}
            onClick={() => {
              setUpload(null);
              setShowGuide(false);
              setMode("camera");
            }}
          >
            카메라로 촬영하기
          </button>
          <AlbumImageUploader
            requestConsent={consent.requestConsent}
            onUploadComplete={(result) => {
              setUpload(result);
              if (!result) setShowGuide(false);
            }}
          />
        </>
      )}
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
        </section>
      )}
    </>
  );
}
