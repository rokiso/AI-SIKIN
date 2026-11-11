# SIKIN

AI 피부 분석 및 맞춤 관리 서비스를 위한 모바일 웹/PWA 기반입니다. Next.js 16 App Router, React, TypeScript strict, Tailwind CSS, Prisma 7과 PostgreSQL 17을 사용합니다.

## 현재 설정 상태

PWA 설치 메타데이터·서비스 워커, PostgreSQL/Prisma 초기 스키마와 마이그레이션, DB 기반 헬스체크를 구현했습니다. 공식 Prisma 엔진 다운로드와 체크섬 검증, 두 마이그레이션 적용 및 스키마 차이 검사가 통과했습니다.

기반 검증에서 포맷·린트·전체 타입·프로덕션 빌드, 단위 테스트 22개, 실제 DB 테스트 10개, 브라우저 테스트 18개가 통과했습니다. 브라우저는 PWA 등록·개인 응답 캐시 방지·DB 실패 안내와 320·375·430·1280px 앱 셸을 검사합니다. GitHub 원격 CI 실행이나 환경 게시는 별도로 수행하지 않았습니다.

대시보드의 실제 저장 계약을 위해 추천·주의 성분 배열을 별도 추가 마이그레이션으로 보완했습니다. 이미 적용한 초기 마이그레이션은 수정하지 않습니다. 기존 리포트의 빈 성분 배열을 추정값으로 채우지 않습니다.

메인 대시보드는 본인 진단 이력과 당일 기록을 읽는 화면으로 확장하고 있습니다. 위 테스트 수는 기반 작업의 검증 결과이며, 대시보드 변경의 최종 검증 결과와 구분합니다.

## 실행

Node.js 24와 npm을 사용합니다. `.nvmrc`와 `package-lock.json`을 기준으로 설치하세요.

```sh
nvm use
npm ci
npm run db:up
npm run db:generate
npm run db:validate
npm run db:migrate
npm run dev
```

`npm run db:up`은 관리되는 로컬 Docker 데몬에서 `compose.yaml`의 PostgreSQL을 실행합니다. `.env`가 없으면 임의의 개발용 비밀번호와 `DATABASE_URL`을 생성하고 파일 권한을 `0600`으로 설정합니다. 게스트 증명용 `AUTH_COOKIE_SECRET`이 로컬 파일과 실행 환경에 모두 없으면 임의의 서명 키를 추가합니다. 기존 설정값은 덮어쓰지 않습니다. `.env`는 Git에서 제외되며 `.env.example`에는 변수 이름과 비밀이 아닌 예시만 있습니다.

PostgreSQL 이미지는 버전과 digest로 고정되어 있고, 호스트의 `127.0.0.1:55432`로만 연결됩니다. 데이터는 Docker named volume에 보관됩니다. `npm run db:stop`은 컨테이너를 정지하며 데이터를 삭제하거나 DB를 초기화하지 않습니다.

개발 서버의 기본 포트는 3000입니다. 앱의 정상 준비 상태를 확인하려면 DB와 초기 스키마가 필요합니다. 프로덕션 모드에서는 먼저 빌드합니다.

```sh
npm run build
npm run start
```

`build`와 `typecheck`는 Prisma 클라이언트 생성도 실행합니다. 카카오·구글, S3, AI API 자격 증명은 이 설정 작업에 필요하지 않습니다.

## 데이터베이스 명령

| 명령 | 역할 |
| --- | --- |
| `npm run db:generate` | `prisma/schema.prisma`에서 타입과 클라이언트 생성 |
| `npm run db:validate` | Prisma 스키마 검증 |
| `npm run db:format` | Prisma 스키마 포맷 |
| `npm run db:migrate` | 저장된 마이그레이션을 `prisma migrate deploy`로 적용 |
| `npm run db:status` | 마이그레이션 적용 상태 확인 |
| `npm run db:seed` | 명시적으로 허용한 비활성 개발 샘플만 준비 |

마이그레이션·상태 확인·시드 명령은 포트 `55432`의 loopback 주소와 `sikin_dev` 또는 `sikin_test` DB만 허용합니다. 공유·운영 DB에 대한 초기화나 재설정 명령은 제공하지 않습니다.

개발 샘플이 필요할 때만 다음과 같이 실행합니다.

```sh
ALLOW_SAMPLE_SEED=true npm run db:seed
```

샘플은 시술 10개와 가상 화장품 4개 카테고리이며 모두 비활성 상태입니다. 가격 0은 검증용 자리표시자이고 실제 시장 가격이 아닙니다. 제품 링크는 예약된 무효 도메인을 사용합니다. 고정 개발 ID로 다시 실행할 수 있으며 기존 레코드를 덮어쓰지 않습니다.

`prisma/schema.prisma`는 사용자·인증, 이미지 업로드, 진단, 카탈로그·추천, 데일리 기록 등 12개 모델을 정의합니다. 마이그레이션은 외래키·고유성·점수 및 가격 범위·바우만 코드와 원본 문진/리포트 변경 금지 조건을 포함합니다. 회원 데이터 삭제에 필요한 cascade 삭제는 허용합니다.

## 검증

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run test:db
npm run build
npm run test:e2e
```

- `lint`: ESLint 검사. 경고도 실패로 처리합니다.
- `format:check`: 새 PWA·DB 기반 파일의 Prettier 검사. 기존 앱 셸 전체를 다시 포맷하지 않습니다.
- `typecheck`: Prisma 클라이언트와 Next.js 라우트 타입 생성 후 TypeScript 타입 검사.
- `test`: Vitest 기반 게스트 증명·입력, 공통 UI 상태, PWA·헬스체크·대시보드 상태 테스트.
- `test:db`: 실제 로컬 DB의 모델·관계·제약·불변식·샘플 재실행과 본인 데이터 조회 검증. 실행 중인 로컬 DB, 생성된 클라이언트와 적용된 마이그레이션이 필요합니다.
- `test:e2e`: Playwright 기반 라우팅·레이아웃·접근성·세션 접근 제어·대시보드와 PWA/헬스체크 검증. 프로덕션 빌드가 필요하며 테스트가 서버를 시작합니다.

브라우저 테스트는 기본적으로 시스템 Chromium(`/usr/bin/chromium`)을 사용합니다. 다른 위치의 Chromium을 사용할 때는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`로 실행 파일 경로를 지정하세요. 화면 검증 너비는 320·375·430·1280 CSS 픽셀입니다.

`.github/workflows/ci.yml`은 PR 및 main 푸시 시 같은 검증 순서를 실행하도록 구성되어 있습니다. GitHub에서의 실제 CI 실행 결과는 아직 확인하지 않았습니다.

## 화면과 구현 범위

| 경로 | 역할 |
| --- | --- |
| `/` | 신규 사용자 안내 또는 본인의 최근 진단·오늘 기록 대시보드 |
| `/diagnostic` | 진단 전 촬영·문진 안내 |
| `/catalog/products` | 화장품 카테고리와 추천 준비 상태 |
| `/catalog/procedures` | 시술 정보 가이드 준비 상태 |
| `/snapshot` | 데일리 기록 안내와 빈 상태 |
| `/mypage` | 게스트 안내와 리포트 빈 상태 |

공통 셸은 최대 너비 430px, 상단 헤더·뒤로가기, 5개 하단 탭, 의료 면책 안내, 로딩·오류·404·오프라인 안내를 제공합니다. `/diagnostic/` 하위 경로에서는 하단 탭을 숨기고 면책 문구는 유지합니다.

OAuth 로그인 발급, 카메라 제어, 문진·AI 분석, 실제 제품·시술 데이터와 사용자 저장 흐름은 후속 작업 범위입니다. 해당 기능은 준비 상태로 안내하며, 대시보드에는 저장된 본인 데이터만 표시합니다.

## 대시보드 데이터 조회

진단 이력이 없으면 진단 시작 안내와 세 단계 진행 설명을 표시합니다. 이력이 있으면 가장 최근에 완료된 진단의 피부 타입·실제 점수·요약·저장된 추천 및 주의 성분을 보여줍니다. 성분 정보가 비어 있으면 다른 제품의 전성분이나 추정값으로 채우지 않습니다. 오늘의 스냅샷은 회원 본인의 기록만 조회하며, `Asia/Seoul` 기준 날짜로 판별합니다. 화면에서 진단·스냅샷 데이터를 생성하거나 변경하지 않습니다.

`GET /api/v1/dashboard/summary`는 서버가 검증한 세션을 기준으로 본인의 요약만 반환합니다. 조회 대상 사용자 ID를 쿼리나 헤더로 받지 않습니다. 정의되지 않은 쿼리 파라미터는 HTTP 400과 `INVALID_DASHBOARD_REQUEST`, 조회 실패는 안전한 HTTP 500과 `DASHBOARD_FETCH_FAILED`를 반환합니다. 응답은 `private, no-store`와 `Vary: Cookie`로 제공하며 내부 오류나 세션 값을 노출하지 않습니다.

회원의 `app_session_token`은 데이터베이스의 살아 있는 `AuthSession`과 만료 시각을 확인하는 불투명한 인증 자격 증명입니다. OAuth 발급·콜백·로그아웃 구현은 별도 작업이며, 이 화면은 검증된 세션을 읽는 부분만 사용합니다.

게스트 조회에는 `x-guest-session-id` UUID와 별도 HttpOnly 쿠키 `sikin_guest_proof`가 함께 필요합니다. 서버는 HMAC 서명·UUID 일치·만료를 검증합니다. 증명이 없거나 잘못되면 새 UUID와 증명을 발급하며, 클라이언트가 제시한 기존 UUID를 그대로 서명하지 않습니다. 따라서 서명 증명이 없는 이전 익명 이력은 새 세션에 자동 귀속하지 않습니다. 회원에게 이미 귀속된 이력도 게스트 조회에서 제외합니다.

`AUTH_COOKIE_SECRET`은 서버 환경에 두는 최소 32자 이상의 임의 서명 키입니다. 개발 환경에서는 `db:up`이 준비하며, 클라이언트 공개 변수나 소스·커밋·로그에 넣지 않습니다. `SessionProvider`의 `AppUserSession`은 화면 표시용 상태입니다. 서버 API는 이 클라이언트 상태를 인증 근거로 사용하지 않고 자격 증명을 다시 검증합니다.

## PWA 동작

`app/manifest.ts`는 한국어 앱 이름, `standalone` 표시 모드, 루트 범위·시작 주소와 192/512px 아이콘을 제공합니다. Apple 홈 화면 메타데이터와 현재 셸의 에메랄드 테마를 재사용하고 화면 확대를 허용합니다.

서비스 워커는 프로덕션의 보안 컨텍스트에서만 등록합니다. `/sw.js`는 다시 검증하도록 제공되며 등록 실패 시 안전한 안내와 재시도 버튼을 표시합니다. 현재 서비스 워커에는 응답 캐시나 fetch 가로채기 로직이 없습니다. HTML·RSC·API·인증·사용자 데이터·안면 이미지를 저장하지 않으며 오프라인 페이지 탐색 기능을 제공하지 않습니다. 기존 오프라인 안내는 네트워크 연결 상태를 알리는 기능입니다.

## 공통 기반

- `tailwind.config.ts`: 색상·폰트·모서리 등 공통 디자인 토큰. 화면에서는 역할별 토큰과 공통 버튼 스타일을 재사용합니다.
- `app/layout.tsx`, `components/layout/`: 전역 셸과 네비게이션, 공통 상태 안내.
- 한국어 폰트는 `@fontsource-variable/noto-sans-kr`를 통해 로컬 번들에 포함합니다. 외부 폰트 서버를 호출하지 않습니다.
- 화면 확대를 허용하며 키보드 포커스·본문 바로가기·44×44px 이상 터치 영역을 제공합니다. 기본 버튼과 활성 탭에는 대비 확보를 위해 `primary-700`을 사용합니다.
- `proxy.ts`: Next.js 16의 요청 진입점입니다. 이전 버전의 `middleware.ts`에 해당하며, 게스트 쿠키를 생성·검증합니다.
- `lib/session/server.ts`가 검증된 회원 또는 게스트 상태를 `AppUserSession`으로 투영하여 `SessionProvider`에 전달합니다.
- Prisma 7의 연결 설정은 `prisma.config.ts`, 스키마는 `prisma/schema.prisma`에 있습니다. `generated/prisma/`는 생성 결과로 Git에서 제외되며 `db:generate`로 재생성합니다.
- `lib/prisma.ts`는 `@prisma/adapter-pg`와 제한된 연결 풀을 사용하는 지연 생성 싱글톤입니다. 앱 런타임의 접속 정보는 `server-only`인 `lib/server-env.ts`에서 검증합니다. Prisma CLI는 별도 모듈 로더를 사용하므로 CLI 전용 `prisma.config.ts`에서 환경을 읽습니다.

게스트 UUID와 서명 증명 쿠키는 `HttpOnly`, `SameSite=Lax`, 30일 수명, 프로덕션의 `Secure`를 사용합니다. UUID만으로는 데이터 소유권이 성립하지 않으며, 같은 이름의 클라이언트 헤더도 신원으로 사용하지 않습니다. 후속 로그인·소유권 이전 작업에서도 서버 검증을 유지해야 합니다.

공개 헬스체크 `GET /api/v1/health`는 실제 DB에 `SELECT 1`을 실행합니다. 성공하면 HTTP 200과 `success: true`, `status: "pass"`, `database: "connected"`, UTC ISO 타임스탬프, `version: "v1"`을 반환합니다. DB 연결이나 설정에 문제가 있으면 HTTP 503과 `DATABASE_UNAVAILABLE`을 반환하며 접속 정보는 응답에 포함하지 않습니다.

화면은 연결 확인 중 상태를 표시하고, 준비 상태 확인이 실패하면 “서비스 초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.” 안내와 새로고침 버튼을 제공합니다.

## 진단 이미지 보안 업로드

서명된 직접 PUT URL 발급과 완료 검증 API를 구현했습니다. 기존 업로드 세션 모델 및 서버 인증을 재사용합니다.
설정, 필수 업로드 헤더, 버킷 보안 정책 예시와 검증 범위는 [안면 사진 보관소 가이드](docs/image-vault.md)를 참고하세요.
운영 S3 연결·정책 적용·환경 게시는 수행하지 않았습니다.

## 소셜 로그인

마이페이지·스냅샷의 로그인 모달, `/auth/login`, OAuth 콜백과 인증 API를 추가했습니다.
설정과 배포용 DB 마이그레이션, 제공자 연결 검증의 제한은 [소셜 로그인 가이드](docs/social-login.md)를 참고하세요.
실제 카카오·구글 키 연결 및 카카오 PKCE 지원 검증은 아직 완료하지 않았습니다.
