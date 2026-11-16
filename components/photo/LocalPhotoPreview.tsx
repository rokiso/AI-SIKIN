"use client";

import { useEffect, useRef, useState } from "react";
import { CameraViewfinder } from "@/components/diagnostic/CameraViewfinder";
import { preprocessAlbumImage } from "@/lib/image/clientPreprocess";

export function LocalPhotoPreview() {
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const current = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (current.current) URL.revokeObjectURL(current.current);
    },
    [],
  );

  function clear() {
    controller.current?.abort();
    controller.current = null;
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = null;
    setPreview(null);
    setBusy(false);
    setMessage("");
  }

  async function select(file?: File) {
    if (!file) return;
    clear();
    const pending = new AbortController();
    controller.current = pending;
    setBusy(true);
    try {
      const result = await preprocessAlbumImage(file, pending.signal);
      if (pending.signal.aborted) {
        URL.revokeObjectURL(result.previewUrl);
        return;
      }
      current.current = result.previewUrl;
      setPreview(result.previewUrl);
      setMessage("사진을 이 기기에서만 미리보고 있어요. 저장하거나 분석하지 않았습니다.");
    } catch {
      if (!pending.signal.aborted)
        setMessage("사진을 열 수 없어요. JPG·PNG·WebP 사진을 다시 선택해 주세요.");
    } finally {
      if (controller.current === pending) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  if (camera) return <CameraViewfinder previewOnly onAlbum={() => setCamera(false)} />;
  return (
    <section
      className="space-y-4 rounded-2xl border border-primary-200 bg-primary-50 p-5"
      aria-labelledby="photo-test-title"
    >
      <h2 id="photo-test-title" className="text-lg font-semibold text-primary-800">
        사진 테스트 모드
      </h2>
      <p className="text-sm leading-relaxed text-neutral-700">
        로그인 없이 사진 선택과 미리보기를 체험해 보세요. 사진은 서버로 전송하지 않으며, 저장·AI
        분석·피부 진단은 진행하지 않습니다. 화면을 떠나거나 새로고침하면 미리보기가 사라져요.
      </p>
      <button
        type="button"
        className="button-secondary w-full"
        disabled={busy}
        onClick={() => {
          clear();
          setCamera(true);
        }}
      >
        가이드 카메라로 촬영
      </button>
      <label className="button-primary flex min-h-12 cursor-pointer items-center justify-center">
        앨범에서 사진 선택
        <input
          aria-label="앨범에서 사진 선택"
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            void select(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <label className="button-secondary flex min-h-12 cursor-pointer items-center justify-center">
        휴대폰 카메라로 촬영
        <input
          aria-label="휴대폰 카메라로 촬영"
          className="sr-only"
          type="file"
          accept="image/*"
          capture="user"
          disabled={busy}
          onChange={(e) => {
            void select(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs leading-relaxed text-neutral-600">
        촬영 버튼은 휴대폰에서 카메라를 열 수 있어요. PC에서는 파일 선택창이 열릴 수 있습니다.
        지원되지 않는 HEIC 사진은 JPG로 변환해 주세요.
      </p>
      {busy && <p role="status">이 기기에서 사진을 준비하고 있어요…</p>}
      {preview && (
        <div className="space-y-3">
          {/* The object URL exists only in this browser; no image request is made. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="이 기기에서 선택한 사진 미리보기"
            className="max-h-96 w-full rounded-xl object-contain"
          />
          <button type="button" className="button-secondary w-full" onClick={clear}>
            미리보기 지우기
          </button>
        </div>
      )}
      <p role="status" className="text-sm leading-relaxed text-neutral-700">
        {message}
      </p>
    </section>
  );
}
