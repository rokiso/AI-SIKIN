"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
const UploadActivityContext = createContext<{
  busy: boolean;
  setBusy: (busy: boolean) => void;
} | null>(null);
export function UploadActivityProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const value = useMemo(() => ({ busy, setBusy }), [busy]);
  return <UploadActivityContext.Provider value={value}>{children}</UploadActivityContext.Provider>;
}
export function useUploadActivity() {
  const value = useContext(UploadActivityContext);
  if (!value) throw new Error("UploadActivityProvider is required");
  return value;
}
