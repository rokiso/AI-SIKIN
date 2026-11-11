import { OAuthCallback } from "@/components/auth/OAuthCallback";
export const metadata = {
  title: "로그인 확인 | SIKIN",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};
export default async function CallbackPage({ params }: { params: Promise<{ provider: string }> }) {
  return <OAuthCallback provider={(await params).provider} />;
}
