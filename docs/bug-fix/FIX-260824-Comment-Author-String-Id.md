# FIX-260824 코멘트 작성자 판정 실패 — JWT userId 문자열 vs 엄격 비교

- 발견: 2026-08-24 스테이징 수동 스모크 M7 (PR #346 배포 직후)
- 증상: 본인이 방금 작성한 코멘트의 **수정**이 E5054(작성자 아님)로 거부. 삭제는 마스터 권한 우회로 통과해 결함이 가려짐.

## 근본 원인 (로그/재현 기반)

JWT principal의 `userId`는 문자열이다(토큰 페이로드 `"userId":"1"`; TS 타입은 number라 컴파일러가 못 잡음).
`ChatCommentService.update/remove`가 `Number(comment.authorId) !== userId`로 **엄격 비교**하여
`1 !== "1"` → 모든 작성자가 자기 코멘트의 소유권 검사에서 탈락했다.
유닛 테스트는 숫자 픽스처(7)를 써서 통과 — 기존 교훈 "bigint PK는 문자열 픽스처"([[bigint-pk-string-test-fixtures]])의
정확한 재발 형태(이번엔 PK가 아니라 **JWT actor id**가 문자열).

## 수정 (최소 변경)

- `chat-comment.service.ts` update/remove: 비교 양변 모두 `Number(...)` 강제.
- `chat-comment.service.spec.ts`: userId를 문자열(`'7' as unknown as number`)로 넘기는 회귀 케이스 추가.

## 영향 범위 점검

- 같은 PR의 다른 신규 경로는 안전: 알림 ack/브리핑 requestedBy는 저장만 하고(쿼리 술어는 MySQL이 형변환),
  프런트 CommentCard는 `String()` 양변 비교라 무관.

## 예방 패턴

**JWT/HTTP 경계에서 온 id를 `===`/`!==`로 비교하지 말 것** — DB 값(bigint transformer→number)과
principal 값(문자열)의 혼합 비교는 항상 `Number()` 양변 강제 또는 문자열 양변 강제.
테스트 픽스처는 실제 런타임 타입(JWT=문자열)을 써야 이 부류가 잡힌다.

## 배포

- PR #350 (main), 스테이징 재배포 + M7 재검증(수정 성공) — 본문 RPT-260824 갱신 참조.
