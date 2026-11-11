export interface SessionCookieValues {
  sessionToken?: string;
  guestId?: string;
  guestProof?: string;
}

export type VerifiedIdentity =
  | { kind: "member"; userId: string; nickname: string; role: "USER" | "ADMIN" | "GUEST"; guestDeviceId: string | null }
  | { kind: "guest"; guestDeviceId: string }
  | { kind: "anonymous" };
