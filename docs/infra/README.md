# 미루비아 비공개 S3 정책 준비

이 산출물은 ign8t 작업 `6df9e365-44a8-4cdb-b999-b94273765cf1`의 로컬 준비 단계입니다. **실제 AWS 계정에 적용된 설정이 아닙니다.**

2026-11-18(Asia/Seoul) 확인 시 앱의 `S3_VAULT_BUCKET`, `S3_VAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`가 없었습니다. `AWS_PROFILE`과 설정 파일 경로는 존재하지만 선택된 프로파일 항목은 없으며, 연결 manifest의 AWS identity도 0개였습니다. 프로파일 환경 변수의 존재만으로 실제 AWS 접근을 확보했다고 간주하지 않습니다.

## 정책 생성

저장소 루트에서 실제로 사용할 버킷 이름과 정확한 앱 origin을 지정합니다. 아래 버킷 이름은 예시이며 생성되거나 사용 가능함을 확인한 이름이 아닙니다.

```sh
npm run storage:plan -- --bucket miruvia-example-private-vault --origin https://miruvia.vercel.app
```

기본 출력은 새 `/tmp/miruvia-s3-plan-*` 디렉터리입니다. `--out NEW_DIRECTORY`로 새 경로를 지정할 수도 있습니다. 기존 디렉터리와 파일은 덮어쓰지 않습니다. 승인된 origin이 여러 개면 `--origin`을 반복합니다. 개발 전용 localhost origin이 필요한 경우에만 `--allow-localhost --origin http://localhost:3000`을 명시합니다. 와일드카드, 사용자 정보·경로·쿼리·fragment가 포함된 URL과 외부 HTTP origin은 거절합니다.

이 명령은 자격 증명을 읽거나 AWS에 접속하지 않습니다. `--apply` 기능도 없습니다. 생성 결과를 검토한 뒤 계정 변경은 별도로 수행해야 합니다. 원본 JSON의 `__BUCKET_NAME__`, `__APP_ORIGINS__` 자리표시자가 남은 파일을 AWS에 제출하지 않습니다.

| 파일 | 역할 |
| --- | --- |
| `s3-encryption.json` | 기본 SSE-S3/AES256 |
| `s3-public-access-block.json` | 퍼블릭 액세스 차단 4종 모두 true |
| `s3-ownership-controls.json` | Bucket owner enforced, ACL 비활성 |
| `s3-cors.json` | 정확한 origin의 GET/PUT/HEAD, 필요한 헤더, ETag 노출 |
| `s3-bucket-policy.json` | 비 TLS 요청과 AES256 헤더 없는 사진 PUT 거절 |
| `iam-policy.json` | 지정한 한 버킷의 raw-faces/·daily-snapshots/에 GetObject·PutObject만 허용 |

## 스펙과 기존 코드의 조정

- 스펙 예시의 `s3:HeadObject`는 IAM 액션명이 아닙니다. SDK의 HeadObject 호출 권한은 `s3:GetObject`로 제공합니다.
- 현재 앱은 사진 삭제·버킷 목록·설정 변경 연산을 하지 않으므로 앱 IAM 정책에 DeleteObject, ListBucket, 버킷 관리 권한을 추가하지 않습니다. 관리자가 설정을 적용할 권한과 앱의 최소 권한은 구분합니다.
- 여러 버킷에 대한 `kbeauty-skin-vault-*` 리소스와 `https://*.vercel.app` origin을 사용하지 않습니다. 대상 버킷과 승인된 origin을 정확히 지정합니다.
- S3 Bucket Key는 SSE-KMS용이므로 SSE-S3/AES256 템플릿에 `BucketKeyEnabled:true`를 강제하지 않습니다.
- `AWS_S3_BUCKET_NAME`/`AWS_REGION`과 새 `lib/s3` 모듈을 중복 생성하지 않습니다. 기존 `S3_VAULT_BUCKET`/`S3_VAULT_REGION`, `lib/server-env.ts`, `lib/storage/s3-vault.ts` 및 업로드/스냅샷 무결성 검증을 재사용합니다.
- 설정 로더는 누락·예시 자리표시자와 인증 정보·쿼리·fragment가 섞인 endpoint를 거절합니다. 오류에는 잘못된 변수 이름만 포함하고 값은 포함하지 않습니다. HTTP endpoint는 기존처럼 개발·테스트의 loopback에만 허용합니다.
- CORS는 권한 부여가 아닙니다. 비공개 버킷과 최소 IAM, 서명 URL, 서버의 소유권·객체 메타데이터 검증을 함께 유지합니다.

`s3:ListBucket`이 없으면 없는 객체에 대한 HEAD가 404 대신 403일 수 있습니다. 이를 위해 앱에 목록 권한을 추가하거나 403을 임의로 성공/미존재로 바꾸지 않습니다. 실제 연결 검사에서 객체 누락과 권한 오류를 구분해 확인해야 합니다. AWS의 [HeadObject 권한 설명](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)과 [S3 Bucket Key 설명](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)을 참고하세요.

## 실제 계정 설정 시 필요한 절차

먼저 사용할 AWS 계정·권한과 비공개 테스트 버킷 이름을 확정해야 합니다. 이전에 보류한 실제 AWS 리소스 생성·변경을 이번 로컬 준비 단계에서 실행하지 않았습니다. 이미 사용 중인 버킷이라면 기존 정책·CORS를 읽고 보존한 뒤 병합해야 하며, 현재 템플릿으로 알 수 없는 기존 설정을 통째로 덮어쓰지 않습니다.

계정 관리자는 서울 리전의 승인된 버킷에 기본 암호화 SSE-S3/AES256, Block Public Access 4개 true, Bucket owner enforced를 설정합니다. 검토한 Deny 버킷 정책과 정확한 앱 origin의 CORS를 적용합니다. AWS CLI의 `put-bucket-cors --cors-configuration`은 생성 파일 전체(CORSRules 객체)를 사용하고, S3 콘솔 CORS 편집기는 해당 `CORSRules` 배열을 사용합니다. S3 콘솔에 객체 전체를 배열처럼 붙여 넣지 않습니다.

런타임의 앱 IAM 권한은 생성한 `iam-policy.json`에 한정합니다. 키를 쓰는 배포 방식이라면 서버의 비밀 저장소에만 입력하고, 사용자 공개 변수·Git·채팅에 넣지 않습니다. 역할 또는 임시 자격 증명 방식은 배포 플랫폼과 기존 명시적 자격 증명 로더의 호환성을 별도로 확인해야 합니다. 빈 키나 플랫폼 프록시 자리표시자를 유효한 raw AWS 서명 키로 임의 간주하지 않습니다.

그 뒤 개인정보 없는 합성 이미지로 실제 서명 PUT → HEAD → 완료 API → 서명 GET을 검증하고, 비서명 GET의 공개 접근 차단, 암호화 메타데이터, 승인/미승인 origin의 브라우저 CORS를 확인해야 합니다. 로컬 모의 서버의 응답으로 이 검증을 대신하지 않습니다. 확인 전에는 실제 암호화·CORS·IAM 연결 완료 기준을 완료로 표시하지 않습니다.

객체 보관 수명·삭제 배치·운영 DB 변경·공개 배포·환경 게시·이전 환경 삭제는 이번 작업에 포함하지 않습니다. 기존 사진 체험 모드와 미복구 `8b4c542` 기록도 유지합니다.

## 로컬 검증 결과와 적용 대기

2026-11-18 검증 결과:

| 검사 | 결과 |
| --- | --- |
| `npm run lint`, `npm run format:check`, `npm run typecheck` | 통과 |
| `npm run test` | 단위 177개 통과 |
| `npm run test:db` | 로컬 DB 90개 통과 |
| `npm run build` | 통과 |
| `CI=1 npm run test:e2e -- --project=stored-photo tests/album-upload.spec.ts tests/snapshot.spec.ts` | 업로드·스냅샷 8개 통과 |
| `npm run storage:plan` | 예시 정책 6종 생성·JSON/ZIP 무결성 확인, AWS 접속 없음 |
| 정책 회귀 검사 | 대상 버킷·두 이미지 경로만 허용, 삭제·목록·가짜 HEAD 액션 미포함, 정확한 CORS origin, TLS·AES256·공개 차단 검사 |
| CLI 보호 검사 | 기존 출력 디렉터리 보존 및 `--apply` 거절 확인 |

필수 실제 완료 기준인 AWS 버킷 암호화 활성화·CORS 적용·IAM 런타임 연결은 **미완료**입니다. 사용할 AWS 계정 연결과 대상 비공개 버킷·리전 정보가 필요하므로 작업은 `blocked`로 기록합니다. 정책 파일 생성이나 로컬 테스트 통과를 실제 계정 설정 완료로 표시하지 않습니다.
