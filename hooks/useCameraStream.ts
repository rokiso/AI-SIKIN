"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useCameraStream() {
  const current = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "requesting" | "active" | "denied" | "unsupported">(
    "idle",
  );
  const release = useCallback(() => {
    request.current++;
    current.current?.getTracks().forEach((track) => track.stop());
    current.current = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setStream(null);
    setStatus("idle");
  }, [release]);
  const start = useCallback(
    async (facingMode: "user" | "environment" = "user") => {
      stop();
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      const token = ++request.current;
      setStatus("requesting");
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
        if (token !== request.current) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        current.current = next;
        setStream(next);
        setStatus("active");
      } catch {
        if (token === request.current) setStatus("denied");
      }
    },
    [stop],
  );
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      release();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [stop, release]);
  return { stream, status, start, stop };
}
