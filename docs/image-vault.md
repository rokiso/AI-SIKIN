# 안면 사진 전용 S3 보관소

이 작업은 두 서버 API를 제공하며 카메라 UI, OAuth 발급, AI 분석은 포함하지 않습니다.
기존 `ImageUploadSession` 모델과 마이그레이션을 재사용하므로 중복 테이블을 생성하지 않습니다.

## 서버 설정

정확한 버킷·origin에 맞춘 보안 정책 JSON과 오프라인 생성 명령은 [S3 정책 준비 가이드](infra/README.md)를 참고하세요. 정책 생성은 실제 AWS 설정 적용과 구분합니다.

`.env.example`의 S3 변수 이름을 사용해 서버 비밀 저장소에 값을 설정합니다.
버킷은 개인정보 DB와 분리하고, 기본 암호화를 AES256으로 설정하며 S3 Block Public Access의 네 옵션을 모두 켭니다.
Object Ownership은 Bucket owner enforced로 설정합니다. 접근 키는 이 버킷의 `raw-faces/*`에 한정된 `s3:PutObject`, `s3:GetObject`만 허용합니다.
서비스는 공개 읽기, 목록 조회, 삭제, 버킷 정책 변경 권한을 요구하지 않습니다.

다음은 관리자가 별도 검토 후 적용할 버킷 정책 예시입니다. `PRIVATE_IMAGE_BUCKET`을 실제 버킷명으로 바꾸세요.
이 문서는 운영 리소스를 생성하거나 정책을 적용하지 않습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RequireTLS",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::PRIVATE_IMAGE_BUCKET", "arn:aws:s3:::PRIVATE_IMAGE_BUCKET/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "RequireExplicitAES256",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::PRIVATE_IMAGE_BUCKET/raw-faces/*",
      "Condition": { "StringNotEquals": { "s3:x-amz-server-side-encryption": "AES256" } }
    }
  ]
}
```

S3 CORS는 실제 앱 origin만 허용하고 PUT, HEAD와 `content-type`, `x-amz-server-side-encryption` 헤더를 허용하며 `ETag`를 노출합니다.
와일드카드 origin이나 공개 읽기는 필요하지 않습니다. S3 호환 로컬 환경은 `S3_ENDPOINT`를 사용합니다.
HTTP는 개발 모드의 loopback 주소에만 허용합니다. 실제 운영 공급자의 AES256 지원과 정책은 운영 연결 후 별도 확인해야 합니다.

## 요청 계약

1. `POST /api/v1/diagnostics/upload-url`에 JSON `{ "mimeType": "image/jpeg", "fileSizeBytes": 10240 }`를 보냅니다.
   jpeg/png/webp, 10,240~10,485,760바이트 정수만 허용합니다.
2. 응답 `data.uploadUrl`로 원본 바이너리를 PUT합니다. `Content-Type`은 요청한 타입,
   `x-amz-server-side-encryption`은 `AES256`이어야 합니다. Content-Length는 파일 길이와 일치해야 하며 브라우저가 설정합니다.
   세 헤더는 서명에 결합되어 있습니다. 서명 URL은 로그·분석 도구·로컬 저장소에 남기지 않습니다.
3. S3 응답의 ETag(따옴표 포함 또는 미포함)와 `uploadSessionId`를 JSON으로
   `POST /api/v1/diagnostics/upload-complete`에 보냅니다.

모든 API는 서버가 검증한 회원/서명 게스트 쿠키를 요구합니다. UUID 헤더만으로는 접근할 수 없습니다.
응답은 `private, no-store`이며 성공/실패 엔벨로프를 따릅니다.
시간당 최대 3회는 PostgreSQL 트랜잭션 advisory lock으로 동시 요청과 다중 서버에서도 적용합니다.
URL 유효시간은 900초입니다. 완료 시 소유권, 만료, HEAD의 ETag·길이·MIME·AES256을 검증합니다.
완료된 세션에 동일 ETag로 재요청하면 기존 확정 시각을 그대로 반환합니다. 만료된 미완료 세션은 410을 반환합니다.

S3 사전 서명 PUT URL 자체는 유효기간 동안 재사용할 수 있습니다. 이 API는 완료 처리의 멱등성을 보장하며,
완료 후 객체 잠금이나 물리적 일회용 URL을 제공하지 않습니다. 후속 분석은 저장된 메타데이터를 다시 검증해야 합니다.

## 검증

`npm test`는 파일 경계, 라우트 입력·인증·오류 비노출과 실제 AWS SDK 서명 헤더를 검사합니다.
`npm run test:db`는 격리된 로컬 PostgreSQL에서 세션 저장·동시 제한·타 소유자 차단·만료·멱등성을 검사합니다.
이 테스트의 S3 HEAD는 mock이며 실제 운영 버킷에 쓰거나 운영 암호화 설정을 검증하지 않습니다.
S3 운영 자격 증명을 준비한 뒤에는 별도 테스트 버킷에서 실제 PUT/HEAD와 공개 읽기 차단을 확인해야 합니다.

## 실제 S3 검증 대기

현재 환경에는 S3 버킷·리전·접근 자격 증명이 없으며, 사용자가 키를 보유하지 않았다고 확인했습니다.
따라서 실제 S3 PUT/HEAD·암호화·공개 읽기 차단 검증은 보류합니다. 모의 스토리지 테스트를 실제 S3 연결 검증으로 간주하지 않습니다.
나중에 별도 테스트 버킷과 최소 권한 자격 증명을 환경의 비밀 변수에 설정한 뒤, 개인정보 없는 테스트 이미지로 검증합니다.
키를 저장소나 채팅에 넣을 필요는 없습니다. 운영 리소스나 환경 게시 작업은 하지 않았습니다.

## S3 호환성 보완과 운영 전 확인

ETag는 따옴표 유무를 모두 받아 따옴표 포함 형태로 정규화합니다. 짝이 맞지 않는 따옴표나 임의 문자열은 거절합니다. 발급 클라이언트·완료 요청 스키마·S3 HEAD·완료 서비스가 같은 정규화 규칙을 사용하며, 실제 다른 ETag는 여전히 거절됩니다. 기존 완료 레코드에 따옴표가 없는 경우에도 같은 ETag로 재시도하면 기존 확정 시각을 반환합니다.

스펙 예시의 AWS_S3_BUCKET_NAME/AWS_REGION/AWS_S3_ENDPOINT 대신 기존 .env.example의 S3_VAULT_BUCKET/S3_VAULT_REGION/S3_ENDPOINT를 유지합니다. 기존 lib/storage/s3-vault.ts와 lib/diagnostic/upload-session.ts를 재사용하며 중복 클라이언트나 테이블을 만들지 않습니다. 원시 게스트 UUID 헤더는 소유권 증명이 아니므로 기존 서명 쿠키만 인정합니다. 시간당3회는 인메모리 대신 DB잠금으로 여러 서버에서 일관되게 집행합니다.

### 미완료 객체 정리

실제 스토리지 연결 시 미완료 업로드의 정리 정책도 설정해야 합니다. raw-faces/ 전체에 만료1일 규칙을 적용하면 완료된 진단 사진도 삭제되므로 운영 버킷에 그대로 적용하지 않습니다. 미완료 전용 태그를 사용하는 정책은 완료 시 태그 변경과 권한 설정까지 갖춰야 하며, 현재 API에는 그 태깅 흐름이 없습니다. 해당 자동정리는 후속 운영 연결 작업으로 남습니다. S3의 일 단위 Lifecycle은 생성 후 정확히24시간 삭제를 보장하지 않습니다.

개인정보가 없는 별도 일회용 테스트 버킷은 테스트 객체 전체를1일 후 만료하도록 설정할 수 있습니다. 이는 실제 버킷이 준비된 뒤 별도로 검증할 사항이며, 이번 작업에서 버킷이나 삭제 규칙을 생성·적용하지 않았습니다. 실제 PUT/HEAD·공개차단·수명주기 검증 전에는 운영 연결 완료로 표시하지 않습니다.

## 만료된 업로드 세션 상태 정리

`expireStaleSessions(now)`는 `PENDING` 상태이고 `expiresAt <= now`인 진단 업로드 세션만 `EXPIRED`로 바꿉니다. 이미 완료·실패·만료된 세션과 아직 유효한 세션은 변경하지 않으며, 반복 실행해도 같은 행을 다시 갱신하지 않습니다. 기존 인덱스와 테이블을 재사용합니다. 완료 처리와 동시에 실행되더라도 DB의 행 잠금 및 상태 조건으로 완료된 세션을 덮어쓰지 않습니다.

로컬 작업 명령은 `npm run uploads:expire`입니다. 기본값은 대상 건수 확인만 수행하며, `npm run uploads:expire -- --apply`에서만 상태를 바꿉니다. 기존 개발 도구처럼 localhost:55432의 sikin_dev/sikin_test만 허용하여 실수로 원격 DB를 변경하지 못하게 합니다. 이 명령은 S3 객체를 조회·삭제하지 않고, 실제 스토리지 보관 기간이나 파일 자동 삭제를 설정하지 않습니다. 정기 스케줄러와 운영 DB 실행은 연결하지 않았습니다.

기존 15분 만료 요청의 HTTP410 동작은 그대로 유지합니다. 시간당3회 제한은 상태와 무관한 생성 횟수를 세므로 만료 정리로 발급 한도가 초기화되지 않습니다. 실제 AWS 연결 보류 및 비공개 버킷 검증 대기 상태도 유지합니다.

## 보안 업로드 인수 계약 재검증 (2026-11-18)

ign8t의 다음 작업 `4eef9cfd-f644-4044-b457-42d9a52a7964`(인수 신호)는 기존 업로드 API와 같은 계약을 지정했습니다. 기존 라우트·모델·AWS SDK 구현을 재사용하고, `tests/database/upload-pipeline.test.ts`에 빠져 있던 연결 구간의 통합 검사를 추가했습니다. 이전 구현을 다시 적용하거나 중복 스키마를 만들지 않았습니다.

새 검사는 저장소 함수를 mock으로 대체하지 않습니다. 실제 라우트 처리기와 DB 세션/게스트 서명 증명, 실제 AWS SDK의 PUT 서명·HEAD 요청을 사용합니다. 저장소만 임의 loopback 포트의 HTTP fixture로 대체하여 합성 바이트를 전송하고 메모리에 보관합니다. 테스트 프로세스에만 명시적인 가짜 자격 증명을 주입하며 실제 `.env`나 AWS 설정을 변경하지 않습니다. 임의 HTTP 호스트를 운영 환경에서 허용하도록 바꾸지도 않습니다.

| 인수 기준 | 근거 |
| --- | --- |
| UUIDv4 키·900초 만료 PUT URL | 실제 발급 응답, SDK 서명 쿼리 및 DB PENDING 행 검사 |
| 직접 PUT 후 완료 확정 | 합성 이미지 HTTP PUT → 실제 SDK HEAD → 완료 API → DB UPLOADED/ETag/확정 시각 검사 |
| AES256·타입·길이 결합 | 서명 대상 헤더 확인, AES256 PUT 헤더 및 HEAD 메타데이터 검사 |
| 미지원 MIME·10MB 초과 거절 | HTTP 400/INVALID_FILE_SPEC, 발급 행 미생성 검사 |
| 다른 소유자·원시 게스트 헤더 차단 | 완료 API 403/401 및 차단 시 HEAD 미호출 검사 |
| 동시 완료 멱등성 | 동시 요청 3건의 동일 응답·확정 시각, HEAD 1회 검사 |
| 만료된 미완료 업로드 거절 | API 410/UPLOAD_SESSION_EXPIRED 및 HEAD 미호출 검사 |

HTTP fixture는 AWS 서명의 형식·헤더 결합을 확인하지만 **AWS 서명의 독립적인 암호 검증기는 아닙니다**. fixture의 GET 403도 실제 버킷의 공개 접근 차단 증거가 아닙니다. 이 검증은 로컬 소프트웨어 계약을 확인한 것이며 실제 AWS PUT/HEAD·CORS·버킷 정책·운영 보관 수명 검증은 위의 보류 상태를 유지합니다. S3 사전 서명 URL 자체가 유효기간 동안 재사용될 수 있다는 제한도 바뀌지 않습니다.

이번 변경의 검증은 lint·format:check·typecheck·build, 전체 단위 150개, 전체 로컬 DB 90개(새 HTTP 통합 5개 포함), `CI=1 npm run test:e2e -- --project=stored-photo tests/album-upload.spec.ts`의 업로드 브라우저 4개(320/1280px)가 모두 통과했습니다. 전체 브라우저 60개를 이번 작업에서 다시 실행한 것으로 기록하지 않습니다. 모의 환경에서 검증 가능한 인수 계약을 완료했으며, 실제 운영 저장소 연결 완료를 뜻하지 않습니다.
