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
  const [cameraMessage, setCameraMessage] = useState("");
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
      <div role="group" aria-label="사진 등록 방법" className="mt-5 flex gap-2">
        {(["camera", "album"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            className="button-secondary min-h-11 flex-1"
            aria-pressed={mode === choice}
            disabled={busy || consent.checking}
            onClick={() => {
              if (mode === choice) return;
              setUpload(null);
              setCameraMessage("");
              setMode(choice);
            }}
          >
            {choice === "camera" ? "카메라로 촬영하기" : "앨범 사진 선택하기"}
          </button>
        ))}
      </div>
      {cameraMessage && (
        <p role="status" className="mt-4 text-sm leading-relaxed">
          {cameraMessage}
        </p>
      )}
      {mode === "camera" ? (
        <CameraViewfinder
          requestConsent={consent.requestConsent}
          onAlbum={() => setMode("album")}
          onUnavailable={(message) => {
            setCameraMessage(message);
            setMode("album");
          }}
          onUploadComplete={(result) => {
            setUpload(result);
            if (!result) setShowGuide(false);
          }}
        />
      ) : (
        <>
          <AlbumImageUploader
            focusPicker={Boolean(cameraMessage)}
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
