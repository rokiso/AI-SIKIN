# 12문항 피부 자가문진

`/diagnostic`에서 문진 먼저 시작하거나, 본인 사진의 등록 완료 후 다음 단계로 시작합니다. 사진 테스트 모드에서도 사진 전송 없이 문진만 진행할 수 있습니다. 사진 미리보기는 기존처럼 기기 내에만 남고, 응답은 완료 버튼을 눌러야 서버에 저장됩니다. 새로고침 시 제출 전 답변은 사라집니다.

바우만의 네 축을 참고해 작성한 독자적인 약식 자가문진입니다. 공식 BSTI 문항을 복제하거나 임상적으로 검증된 검사라고 주장하지 않습니다. 각 축 3문항, 선택지 1~4를 (합계-3)/9*100으로 정규화하고 반올림합니다. 50 이상이면 O/S/P/W, 미만이면 D/R/N/T입니다. elasticity는 기존 API 계약대로 높을수록 주름 고민이 큰 방향입니다. 복합성은 이 16코드의 새 코드로 만들지 않습니다. 화면에는 영어 코드 대신 한글 경향을 안내합니다. AI 분석과 최종 리포트 생성은 이 작업에 포함되지 않으며 완료 화면에 미연결 사실을 표시합니다.

## 저장 API

`POST /api/v1/diagnostics/survey-answers`: JSON `answers` 12개(questionId Q01~Q12 고유, selectedChoice 정수1~4), 선택적 uploadSessionId(null 허용), 선택적 requestId(UUID).

- 기존 DiagnosticSession 및 ImageUploadSession 모델·테이블 재사용, 스키마/운영 DB 변경 없음.
- 공통 업로드 요청 처리기의 크기 제한(4096bytes), origin 검사, 안전한 실패 응답을 재사용.
- 기존 서버 검증 HttpOnly 게스트 서명쿠키 또는 실제 미만료 회원 세션만 신뢰. 원시 guestDeviceId 헤더나 클라이언트 userId는 소유권 증명이 아니며 허용하지 않음.
- 업로드가 있으면 본인 소유·UPLOADED 상태 검증, 다른 사람/미완료 사진은403.
- 유효하지 않은 응답400 INVALID_SURVEY_PAYLOAD, 세션없음401 MISSING_SESSION_IDENTITY, 저장실패503 SURVEY_UNAVAILABLE.
- 소유자별 DB advisory transaction lock으로 분당30건 제한을 여러 프로세스에서도 직렬화. 초과429.
- 클라이언트 requestId는 재시도에 재사용하여 응답유실/동시재시도에도 기존 저장을 반환. 같은 ID의 다른 답변은409로 거절하고 수정하지 않음. 저장 전 답변이 바뀌면 새 ID 생성.
- 성공201: sessionId, status SURVEY_COMPLETED, 4축 axisScores, preliminaryType, createdAt. 응답은 private,no-store.

## 검증

- 16개 축 조합/정규화/배열순서/누락·중복·범위·소유권필드 주입 단위검사.
- 실제 로컬DB API: 회원·서명게스트, 만료/폐기 세션, 재시도 불변성, 사진소유권 및 완료상태, cross-origin/크기 제한, 동시요청 rate limit.
- 브라우저320/1280: 12단계 진행률, 숫자키와 좌우이동, 이전답변 유지, 44px선택영역, 누락제출금지, 실패후응답보존·재시도, pending중복방지, 완료화면/Axe.
- 기존 사진 테스트는 사진 업로드를 하지 않는지 별도 모드로 검증.

이번 작업은 로컬 구현입니다. 공개배포/운영DB/AI 호출/유료자원 설정은 변경하지 않았습니다.
