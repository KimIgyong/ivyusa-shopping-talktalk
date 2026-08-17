# FIX-260815-KSR-Expired-Command-Mapping

relay 커맨드 상태 `EXPIRED` 매핑 누락 — unconfirmed 회신이 영구 재폴링되던 결함.

## 증상
스테이징 채널1(btbz relay) `channel_outbox`에 unconfirmed 126건이 쌓인 채 confirm 스윕이
매 주기 전량 재폴링. 로그에는 아무 에러도 없음(요청은 200 성공, 판정만 영원히 미결).

## 근본 원인
`mapCommandStatus()`(btbz-relay.adapter.ts)가 SENT / SENT_UNCONFIRMED / FAILED 세 상태만
매핑하고 나머지는 `'pending'`으로 폴백. relay의 실제 상태 어휘(DB enum
`relay_command_status`, relay 측 2026-08-15 확인)는:

- 진행 중: `PENDING`, `DISPATCHED`
- **종결**: `SENT`, `SENT_UNCONFIRMED`, `FAILED`, **`EXPIRED`**

`EXPIRED`는 기기가 TTL(5분) 안에 커맨드를 집어가지 못한 경우로 **확정적 미발송**이며
(`failReason: handle_expired`), relay 쪽 상태 전이가 `WHERE status IN
('PENDING','DISPATCHED')` 가드로 잠겨 있어 한 번 EXPIRED면 다시는 변하지 않는다.
즉 `'pending'` 판정은 절대 끝나지 않는 폴링이 된다. 서명 모드(PR #285) 이전 레거시
매핑 시절부터 있던 갭으로, 스테이징 서명 E2E(TCR-260814 §3)에서 표면화됐다.

참고: relay OpenAPI 문서의 `SENT_CONFIRMED`는 DB enum에 없어 실발생 불가(relay 측 확인
— PC 에코 캡처 의존 값, 해당 에이전트 아카이브됨). 폴러에서 기대하면 안 된다.

## 수정 (최소 변경)
- `btbz-relay.adapter.ts` `mapCommandStatus()`: `case 'EXPIRED': return 'failed';` 추가.
  미지의 상태는 기존대로 `'pending'` 유지(향후 진행형 상태가 추가돼도 오판정 없음 — 종결
  어휘가 늘면 그때 명시적으로 추가).
- spec: 레거시 경로 `it.each`에 `['EXPIRED','failed']`, 서명 경로에 EXPIRED 단건 케이스 추가.

기존 unconfirmed 백로그는 배포 후 다음 confirm 스윕에서 자연 해소(`failed` +
`lastError: 'relay agent reported failure'`)되므로 데이터 마이그레이션 불필요.

## 영향
- UI 관점: 해당 회신들은 "미확정"에서 "전송 실패"로 확정된다 — 실제로 발송되지 않았으므로
  정확한 표현. 재시도는 새 idempotency_key로 해야 한다(같은 키는 원본 EXPIRED를 반환).
- 스키마 변경 없음. 서명/레거시 양쪽 confirm 경로가 같은 매퍼를 쓰므로 한 곳 수정으로 끝.

## 예방 패턴
외부 시스템의 상태 enum을 매핑할 때 **"모르는 값 = 진행 중" 폴백은 종결 상태를 영구
폴링으로 바꾼다**. 매핑 작성 시점에 상대 시스템의 전체 상태 어휘(가능하면 DB enum·상태
전이 가드까지)를 확인해 종결/진행을 전수 분류하고, 문서(OpenAPI)가 코드보다 앞서 있을 수
있으니 실발생 가능 여부를 함께 확인한다. 이번처럼 "로그 무에러 + 상태 무변화" 조합은
조용한 폴백이 실패를 정상으로 위장하는 신호다([[invisible-fallback-trap]]과 동족).
