"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppUserSession } from "@/lib/session/types";

const SessionContext = createContext<AppUserSession | null>(null);

export function SessionProvider({ children, session }: { children: ReactNode; session: AppUserSession }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useAppUserSession(): AppUserSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useAppUserSession requires SessionProvider");
  return session;
}
