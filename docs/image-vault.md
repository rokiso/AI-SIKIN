# 안면 사진 전용 S3 보관소

이 작업은 두 서버 API를 제공하며 카메라 UI, OAuth 발급, AI 분석은 포함하지 않습니다.
기존 `ImageUploadSession` 모델과 마이그레이션을 재사용하므로 중복 테이블을 생성하지 않습니다.

## 서버 설정

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
3. S3 응답의 따옴표 포함 ETag와 `uploadSessionId`를 JSON으로
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
