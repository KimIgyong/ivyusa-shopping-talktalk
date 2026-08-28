# FIX-260828 노션 DB→페이지 폴백이 공유된 페이지에서 작동하지 않음

## 증상
go2joy가 노션 페이지를 통합 "Truc connection"에 공유 완료한 후에도 동기화 실패(500).
`last_sync_result.error`(B1로 방금 생긴 가시성): `Provided ID 8968fee0-… is a page, not a database. Use the retrieve page API instead`.

## 근본 원인
`notion.client.retrieveTarget`은 대상 종류를 알아내려 `/databases/{id}`를 먼저 조회하고 **404일 때만** `/pages/{id}`로 폴백한다.
그런데 Notion API의 실제 동작은:
- 페이지가 **미공유** → 404 `object_not_found` (폴백 도달 전 단계 — 8/28 오전 go2joy 실측)
- 페이지가 **공유됨** → **400 `validation_error` "…is a page, not a database…"** (8/28 오후 실측)

즉 404 전용 폴백은 **공유된 페이지에서는 한 번도 실행될 수 없는 코드**였다. mock 테스트는 404 폴백만 재현했고
(TCR-260821 E1/E2 "실 워크스페이스 미검증"), 첫 실 연동이 즉시 이 갭을 드러냈다.

## 수정 (최소 변경)
`retrieveTarget`의 폴백 조건 확장 — 404 **또는** `400 && /is a page, not a database/i` 일 때 페이지 조회로 진행.
그 외 400(진짜 검증 오류)은 종전대로 즉시 전파(에러 은폐 금지, 회귀 테스트 포함).

## 검증
- 유닛 2건 추가(`notion.client.spec.ts`): 공유-페이지형 400 → 페이지 폴백 / 기타 400 → 전파. 전체 스위트 통과.
- 스테이징: 수정 배포 후 go2joy 소스 7 재동기화 → §RPT-260828 기록 (첫 실 워크스페이스 동기화).

## 예방 패턴
- **"X일 때만 폴백" 분기는 상대 API의 실제 실패 모드 전수로 검증해야 한다** — 종류 판별을 에러 코드로 하는 설계는
  성공 케이스 mock만으로는 절대 검증되지 않는다. 실 연동 1회가 필수 게이트(REQ-260828 §5의 E1~E7이 정확히 이것).
- B1(실패 사유 표시)이 없었다면 이 결함도 "500 Internal server error"로만 보였을 것 — **사유 가시화가 다음 결함의
  진단 시간을 직접 단축**한 첫 사례.
