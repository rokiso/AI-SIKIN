# 카카오·구글 소셜 로그인

## 구현 범위

기존 User/UserAccount/AuthSession을 재사용합니다. 새 OAuthAttempt 테이블은 5분 만료 상태의 해시만 저장하고,
인가 요청 제한과 일회성 콜백 소비에 사용합니다. 제공자 토큰은 저장하지 않습니다.
PKCE 상태·verifier·복귀 경로·검증된 게스트 식별자는 AES-256-GCM 암호화 쿠키에 보관합니다.
쿠키의 provider/state/기한을 확인한 다음 토큰을 교환하고, 하나의 DB 트랜잭션 안에서 계정 생성·비회원 이력 이전·세션 발급을 처리합니다.

쿠키 UUID만 또는 임의의 헤더로 타인 기록을 이전할 수 없습니다. 서명 증명과 로그인 시작 시 식별자가 일치해야 하며,
이미 회원에게 귀속된 레코드는 이전하지 않습니다. 이메일이 같은 별도 제공자 계정을 자동 연결하지 않습니다.
로그아웃은 같은 origin의 POST만 허용하고 DB 세션을 즉시 삭제합니다.
로그인 완료는 전체 탐색으로 복귀하므로 서버 SessionProvider 상태도 새로 읽습니다. 로그아웃은 router.refresh를 사용합니다.

## 제공자 설정

Vercel 프로젝트의 환경 변수에 다음 이름을 등록해야 합니다. 비밀 값은 저장소·채팅에 넣지 않습니다.

- `AUTH_COOKIE_SECRET`: 32자 이상의 무작위 세션 서명 키
- `NEXT_PUBLIC_APP_URL`: 실제 사이트 origin, 예: `https://ai-sikin.vercel.app`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth 웹 애플리케이션 클라이언트
- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`: 카카오 REST API 키와 활성화한 클라이언트 시크릿
- `DATABASE_URL`: 테이블이 준비된 배포용 PostgreSQL 연결

Google 콘솔에 `https://ai-sikin.vercel.app/auth/callback/google`을 승인된 리디렉션 URI로 등록합니다.
카카오 콘솔에도 `https://ai-sikin.vercel.app/auth/callback/kakao`를 등록하고 카카오 로그인을 활성화합니다.
카카오 scope는 닉네임만 요구하며 이메일 동의를 필수로 요구하지 않습니다.
실제 origin이 다르면 앱 환경 변수와 양쪽 콜백 주소를 모두 해당 origin으로 일치시킵니다.

## PKCE 호환성 및 실제 연결 상태

두 제공자 어댑터는 S256 challenge를 인가 요청에, verifier를 토큰 요청에 전달합니다.
Google은 PKCE 흐름을 기준으로 구현했습니다. **카카오가 현재 REST API에서 PKCE를 실제 검증하는지는 확인되지 않았습니다.**
카카오 공식 문서 접근이 실행 환경 네트워크에서 HTTP 403으로 차단됐으며, 추가 매개변수를 전송하는 것만으로
서버가 PKCE를 강제한다고 주장할 수 없습니다. 실제 지원이 확인되지 않으면 카카오 PKCE 인수 기준은 미충족입니다.
운영 활성화 전에 공식 계약과 실제 토큰 교환에서 잘못된 verifier 거절을 확인해야 합니다.
제공자 키·콘솔 연결이 없는 상태에서 수행한 mock 테스트는 실제 카카오·구글 로그인 성공의 증거가 아닙니다.

## 마이그레이션과 배포

기존 DB에 `20261112000000_oauth_attempts`, `20261112000100_oauth_request_limits` 두 추가 마이그레이션이 필요합니다.
새로운 빈 DB라면 기존 초기 스키마와 report_ingredients 마이그레이션도 순서대로 적용해야 합니다.
운영 DB에 reset/db push를 사용하지 않습니다. 검토한 마이그레이션을 배포용 DATABASE_URL을 설정한 환경에서
Prisma의 `prisma migrate deploy`로 적용합니다. 저장소의 `npm run db:migrate`는 의도적으로 격리된 로컬 DB만 허용합니다.
배포 작업에서 그 보호 장치를 제거하지 않습니다. 현재 작업에서는 로컬 DB에만 적용했습니다.
만료된 oauth_attempts는 이후 동일 게스트 요청 시 정리되며, 운영에서는 만료 레코드 주기 정리도 설정할 수 있습니다.

## 검증

- PKCE RFC7636 벡터, 상태 쿠키 암호화·변조·만료, 내부 경로 검증, 양쪽 제공자 요청·프로필 파싱 mock
- 실제 로컬 PostgreSQL의 계정 재사용·동시 콜백·세션 만료/폐기·이메일 자동 연결 금지·서명 게스트 소유권 이전
- API 인가→콜백→me→logout, 잘못된 state, CSRF·요청 크기·인가 횟수 제한
- 320/360/1280px 모달 접근성·포커스 트랩·Esc 닫기·중복 제출 차단·실패 및 재시도, 콜백 URL 쿼리 제거

실제 제공자 로그인을 최종 검증하기 전에는 보드 상태를 review로 유지합니다.
