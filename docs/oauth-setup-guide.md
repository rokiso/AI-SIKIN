# 카카오·구글 로그인 연결 설정

현재 개발자 콘솔 등록과 실제 로그인은 **미검증**입니다. 로컬 환경에는 `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`이 없습니다. 임의 키를 만들어 등록하거나 mock 성공을 실제 연결 성공으로 기록하지 않습니다.

## 등록할 주소

현재 배포 대상 도메인 기록은 `https://miruvia.vercel.app`입니다. 실제 사용할 도메인이 다르면 아래 운영 주소와 해당 환경의 `NEXT_PUBLIC_APP_URL`을 함께 바꿔야 합니다.

| 용도 | 로컬 | 운영 |
| --- | --- | --- |
| 웹 원본 | `http://localhost:3000` | `https://miruvia.vercel.app` |
| Google 리디렉션 URI | `http://localhost:3000/auth/callback/google` | `https://miruvia.vercel.app/auth/callback/google` |
| Kakao 리디렉션 URI | `http://localhost:3000/auth/callback/kakao` | `https://miruvia.vercel.app/auth/callback/kakao` |

`/api/v1/auth/callback/[provider]`는 브라우저 콜백 페이지가 JSON으로 호출하는 **POST API**입니다. 제공자가 브라우저를 보내는 리디렉션 URI로 사용하면 안 됩니다. 저장소의 실제 경로·메서드에 맞춰 위의 `/auth/callback/…` 주소를 등록합니다. `/` 추가, 포트 변경, 임의의 미리보기 도메인 사용도 일치 여부를 바꿉니다. 로컬 실제 POST 검증은 NextURL 정규화에 맞게 localhost로 접속합니다.

## 카카오 개발자 콘솔

[카카오 디벨로퍼스](https://developers.kakao.com/)에서 본인의 앱을 선택합니다. 기존 앱이 있으면 재사용하고, 없다면 서비스 소유자 계정으로 생성합니다. 서비스 표시명은 미루비아/MIRUVIA를 기준으로 확인합니다.

1. 앱의 **플랫폼 → Web**에서 위 로컬·운영 웹 원본을 사이트 도메인으로 등록하고 저장합니다.
2. **카카오 로그인** 활성화 설정을 켜고, **Redirect URI** 항목에 위 카카오 주소 두 개를 추가한 뒤 저장합니다.
3. **동의항목**에서 닉네임 `profile_nickname`을 설정합니다. 현재 구현은 이메일을 필수로 요구하지 않습니다. 이메일 미동의 사용자도 카카오 고유 ID로 가입할 수 있습니다. 불필요한 사진·이메일 권한을 추가하지 않습니다.
4. **보안 → Client Secret**에서 시크릿을 발급하고 사용 상태를 활성화합니다. 앱 키의 **REST API 키**를 `KAKAO_CLIENT_ID`에, 활성화된 Client Secret을 `KAKAO_CLIENT_SECRET`에 등록합니다. JavaScript 키나 Admin 키를 대신 넣지 않습니다.
5. 현재 어댑터는 액세스 토큰으로 공식 프로필 API를 조회합니다. OIDC를 활성화하더라도 ID Token 검증을 완료한 것으로 취급하지 않습니다.

카카오 PKCE 강제 검증은 아직 확인되지 않았습니다. S256 challenge/verifier를 전송하는 것만으로 지원을 증명할 수 없습니다. 서비스 소유자 계정의 실제 테스트에서 정상 verifier 성공과 잘못된 verifier 거절을 확인해야 합니다. 이번 환경의 공식 문서 재조회도 실패했으므로 지원 여부를 새로 단정하지 않습니다. 필요하면 공급자 공식 지원 확인 뒤 별도 계약 변경으로 처리합니다.

## 구글 클라우드 콘솔

[Google Cloud Console](https://console.cloud.google.com/)에서 서비스 소유 프로젝트를 선택합니다. **Google Auth Platform**의 브랜딩·대상·데이터 액세스·클라이언트 메뉴를 사용합니다. UI 버전에 따라 **API 및 서비스 → OAuth 동의 화면/사용자 인증 정보**로 표시될 수도 있습니다.

1. 동의 화면에 서비스 표시명, 본인 계정의 지원 이메일·개발자 연락처를 등록합니다. 존재하지 않는 주소를 입력하지 않습니다.
2. 외부 사용자를 대상으로 설정하고 테스트 모드라면 실제 로그인할 본인 계정을 테스트 사용자로 추가합니다. 이 작업만으로 앱을 공개 상태로 전환하지 않습니다.
3. 데이터 액세스 범위는 현재 코드의 `openid email profile`에 맞춥니다.
4. **클라이언트 → 클라이언트 만들기 → 웹 애플리케이션**을 선택합니다. 승인된 JavaScript 원본에는 위 웹 원본, 승인된 리디렉션 URI에는 위 Google 주소 두 개를 각각 등록하고 저장합니다.
5. 발급된 클라이언트 ID와 시크릿을 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 등록합니다.

## 키를 넣을 위치와 사전 검사

로컬에서는 Git에서 제외된 `.env`에만 저장합니다. 클라우드 작업 환경에서는 **환경 편집 → 환경 변수 → 관리**에서 등록합니다. 공개 서비스에 연결할 때는 **Vercel 프로젝트 → Settings → Environment Variables**에 대상 환경별로 등록합니다. 로컬 `.env`에 넣은 값이 Vercel에 자동 전달되지는 않습니다. 키는 채팅·스크린샷·커밋에 넣지 않습니다.

| 환경 변수 | 값의 출처 |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | 로컬은 `http://localhost:3000`, 운영은 실제 HTTPS 사이트 원본 |
| `GOOGLE_CLIENT_ID` | Google 웹 애플리케이션 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 같은 Google 클라이언트의 시크릿 |
| `KAKAO_CLIENT_ID` | Kakao 앱의 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 같은 Kakao 앱에서 활성화한 Client Secret |
| `AUTH_COOKIE_SECRET` | 기존의 32자 이상 무작위 서명 키 유지 |

`GOOGLE_REDIRECT_URI`, `KAKAO_REDIRECT_URI`는 선택 항목입니다. 비워 두면 위 앱 원본에서 자동 계산됩니다. 명시한다면 해당 `/auth/callback/[provider]` 주소와 정확히 일치해야 합니다. `.env` 문자열 `${NEXT_PUBLIC_APP_URL}` 치환에 의존하지 않습니다. 비밀키 이름에는 `NEXT_PUBLIC_`를 붙이지 않습니다.

```sh
npm run auth:check
```

이 명령은 외부 요청·DB 변경 없이 현재 프로세스 설정을 검사합니다. 누락·플레이스홀더·주소 불일치가 있으면 필드 이름만 출력하고 종료 코드 1로 실패합니다. 모든 설정 형식이 맞을 때도 콘솔 등록·실제 토큰 교환·카카오 PKCE는 `NOT_VERIFIED`로 남습니다. 키 값이나 클라이언트 ID가 들어간 인가 URL을 출력하지 않습니다.

로그인이 필수인 배포의 시작 전 검사는 `npm run auth:check && npm run start`로 연결할 수 있습니다. 현재처럼 로그인 키가 없는 체험 환경 전체를 중단시키지는 않으며, 실제 로그인 요청은 잘못된 설정으로 진행하지 못합니다. 이번 작업에서 시작 스크립트나 클라우드 환경 초안을 바꾸거나 게시하지 않았습니다.

## 실제 연결 인수 확인

설정 등록 후 앱의 로그인 버튼으로 시작하여 동의·복귀·리포트 소유권 이전을 확인합니다. 구글 테스트 사용자 제한과 카카오 `KOE006`, Google `redirect_uri_mismatch` 오류는 콘솔에 저장한 주소와 현재 앱 원본부터 비교합니다. 오류 화면이나 서버 로그를 공유할 때 코드·토큰·시크릿을 제거합니다.

- 두 제공자에서 정상 동의 후 `/mypage`로 복귀하고, 같은 계정의 재로그인이 기존 계정을 사용해야 합니다.
- 서명된 현재 게스트 리포트만 계정으로 이전되고 다른 사용자 기록은 노출되지 않아야 합니다.
- 시크릿/인가 코드 오류 시 회원 세션이 만들어지지 않고 안전한 오류로 복구되어야 합니다.
- 실제 토큰과 개인정보는 검증 문서·커밋·보드에 기록하지 않습니다. 제공자·환경·성공/실패·시각만 기록합니다.

실제 콘솔 접근과 유효한 제공자 자격증명이 없으므로 이 작업을 완료 상태로 바꾸지 않습니다. 운영 배포와 운영 DB 마이그레이션도 수행하지 않습니다. 기존 환경과 미복구 원 커밋 `8b4c542` 기록은 유지합니다.

## 로컬 검증 결과 — 2026-11-18

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: 통과.
- `npm run test`: 전체 단위 테스트 201개 통과. 환경 변수 누락·플레이스홀더·유효하지 않은 URL·명시적 리디렉션 불일치·키 변경 감지와 양쪽 제공자의 토큰 요청 필드·프로필 파싱 포함.
- `npm run test:db`: 로컬 PostgreSQL 테스트 108개 통과. 양쪽 제공자의 시크릿 거절 시 안전한 HTTP 502, 회원 세션 미발급, 잘못된 콜백 설정의 사전 차단, 기존 서명 게스트 이력 이전 검증 포함.
- `npm run test:e2e -- tests/auth.spec.ts tests/diagnostic-report.spec.ts tests/photo-test-mode.spec.ts`: 로그인·리포트·체험 모드 11개 통과.
- CLI를 실제 별도 프로세스로 실행해 형식상 정상(종료 0), 키 누락·콜백 불일치·운영 HTTP·유효하지 않은 URL(종료 1)을 확인. 테스트용 키와 잘못된 URL 원문이 stdout/stderr에 포함되지 않음을 검사.
- `npm run auth:check`: 현재 실제 작업 환경은 필수 설정 5개 누락으로 예상대로 종료 1. 이 결과를 성공이나 외부 연결 완료로 바꾸지 않음.

유효하지 않은 URL에서 기존 `z.url().refine()` 내부의 `new URL()`이 Zod 검증 결과 대신 TypeError를 던지는 문제도 확인했습니다. URL 생성 전에 파싱 가능 여부를 확인하여 키 이름만 담은 안전한 설정 오류로 처리합니다. 새 모듈·스키마·라우트를 중복 생성하지 않고 `lib/server-env.ts`와 기존 제공자 어댑터를 재사용했습니다.

스펙 예시와 다른 점은 명시적으로 유지합니다. 실제 브라우저 콜백만 콘솔에 등록하며 POST API를 리디렉션 대상으로 삼지 않습니다. 기존 결정대로 카카오 이메일 수집은 필수가 아닙니다. 로그인 필수 환경은 사전 검사로 기동을 차단할 수 있지만 자격증명 미설정 체험 환경 전체를 중단시키지는 않습니다. 외부 콘솔/토큰 교환과 카카오 PKCE 강제 검증이 미충족이므로 보드 상태는 blocked로 기록합니다.
