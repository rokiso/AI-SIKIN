import { PageHeading } from "@/components/ui/PageHeading";
import { SocialLoginButtons } from "@/components/auth/SocialAuthModal";
import { safeReturnPath } from "@/lib/auth/validation";
export const metadata = { title: "로그인 | SIKIN", referrer: "no-referrer" as const };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const query = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="소셜 로그인"
        title="내 피부 관리 이어가기"
        description="로그인하면 비회원으로 확인한 분석 결과도 내 계정에 보관할 수 있어요."
      />
      <SocialLoginButtons returnPath={safeReturnPath(query.redirect_url)} />
    </div>
  );
}
