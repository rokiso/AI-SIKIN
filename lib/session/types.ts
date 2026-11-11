export interface AppUserSession {
  isAuthenticated: boolean;
  userId: string | null;
  role: "guest" | "authenticated" | "admin";
  guestDeviceId: string;
  nickname?: string;
}
