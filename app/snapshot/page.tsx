import { SnapshotHistory } from "@/components/snapshot/SnapshotHistory";
import { getKstDate } from "@/lib/dashboard/date";
import { isPhotoTestMode } from "@/lib/photo-test-mode";
import { LocalPhotoPreview } from "@/components/photo/LocalPhotoPreview";
import { unstable_rethrow } from "next/navigation";
import { SocialAuthModal } from "@/components/auth/SocialAuthModal";
import { DailySnapshotRecorder } from "@/components/snapshot/DailySnapshotRecorder";
import { getAppUserSession } from "@/lib/session/server";
import { getTodaySnapshot } from "@/lib/snapshot/service";
import type { SnapshotView } from "@/lib/snapshot/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeading } from "@/components/ui/PageHeading";
import { isSnapshotMilestonesEnabled } from "@/lib/server-env";
export const dynamic = "force-dynamic";
export default async function SnapshotPage() {
  const photoTest = isPhotoTestMode();
  const session = await getAppUserSession();
  let initialSnapshot: SnapshotView | null = null;
  let initialError = false;
  if (!photoTest && session.isAuthenticated && session.userId) {
    try {
      initialSnapshot = (await getTodaySnapshot(session.userId)).snapshot;
    } catch (error) {
      unstable_rethrow(error);
      console.error("[snapshot] Today's record could not be loaded");
      initialError = true;
    }
  }
  return (
    <div className="space-y-6 break-keep">
      {photoTest ? (
        <>
          <PageHeading
            eyebrow="사진 테스트"
            title="사진 선택을 체험해 보세요"
            description="테스트 모드에서는 사진을 저장하거나 피부를 분석하지 않습니다."
          />
          <div id="snapshot-recording">
            <LocalPhotoPreview />
          </div>
        </>
      ) : (
        <PageHeading
          eyebrow="데일리 기록"
          title="작은 변화를 한 장씩"
          description="그날의 피부 상태를 사진과 함께 남기고 돌아볼 수 있는 나만의 기록 공간이에요."
        />
      )}
      {session.isAuthenticated ? (
        <>
          {!photoTest && (
            <div id="snapshot-recording">
              <DailySnapshotRecorder
                initialSnapshot={initialSnapshot}
                initialError={initialError}
                milestonesEnabled={isSnapshotMilestonesEnabled()}
              />
            </div>
          )}
          <SnapshotHistory
            initialMonth={getKstDate().slice(0, 7)}
            refreshKey={initialSnapshot?.id}
          />
        </>
      ) : (
        <>
          <section className="rounded-2xl border border-primary-100 bg-primary-50 p-5">
            <h2 className="text-base font-semibold text-neutral-900">
              일일 피부 기록은 로그인이 필요한 서비스입니다
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">
              데일리 피부 기록은 로그인 후 이용할 수 있습니다. 마이페이지에서 로그인하거나 아래
              버튼을 눌러주세요. 사진과 오늘의 관리 안내를 하루 한 번 저장할 수 있어요.
            </p>
            <SocialAuthModal />
          </section>
          <EmptyState />
        </>
      )}
    </div>
  );
}
