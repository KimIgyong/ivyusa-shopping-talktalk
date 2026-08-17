# REQ-260814-KSR-Provider-Signed-Client

KSR(btbz-messenger relay) **provider API v1(HMAC 서명)** 을 소비하는 ShopTalk 클라이언트 구현 분석.
서버 측 준비는 2026-08-14 서명 규격 컨포먼스 테스트로 확인 완료(T1~T9 전부 통과 — 함정 2종 포함).

## 1. AS-IS

### 1a. ShopTalk (BtbzRelayAdapter, PLN-260810 PR-M3)
| 항목 | 현황 |
|---|---|
| 인증 | **운영자 email/password 로그인** → `ksr_token` JWT(12h, Redis 캐시). 운영자용 `/api/inbox/*` API 사용 |
| pull | 대화 목록 전체 → 워터마크(문자열 비교, [[naive-timestamp-poll-cursor-trap]] 회피) → 대화별 메시지 fetch(**N+1**) → inbound 커서=메시지 id |
| send | `POST /api/relay/replies` → command_id, `unconfirmed` 반환 |
| confirm | 대화별 commands **목록** 폴링에서 탐색 |
| 자격증명 | 채널 JSON 필드 email/password(AES, `channelField`) |
| 운영 | 스테이징 채널1(amoebaorder) 가동 중 — kakao_pc/sms |

### 1b. KSR provider API v1 (2026-08-14 검증)
| 항목 | 내용 |
|---|---|
| 인증 | HMAC-SHA256: `X-KSR-Key-Id/Timestamp/Nonce/Signature(v1=64소문자hex)`, canonical=`METHOD\n경로+쿼리(보낸 그대로)\nts\nnonce\nsha256hex(body)`. 스큐 300s, 논스 TTL 600s(재사용 409 E1105), 키=콘솔 발급(90일 로테이션·14일 중첩·IP 허용목록·권한 스코프) |
| 읽기 모델 | `GET /instance`(무권한, **X-KSR-Expected-Customer 바인딩 검증** — 불일치 409 E5101) · `GET /conversations`(updated_since·reply_enabled) · `GET /messages?since_id=`(**삽입순 id 단일 증분 커서**, `truncated`=이력 소실 신호) · `GET /messages/:id` · `GET /commands/:id`(단건) |
| 에러 | E1101 헤더 / E1102 키 / E1103 서명 / E1104 스큐 / E1105 논스 / E1107 IP |
| ⚠️ 갭 | **쓰기 라우트 없음** — `send:replies`/`manage:webhooks` 권한만 정의, 회신 POST·웹훅 등록 라우트 미노출. 회신은 여전히 운영자 API(`/api/relay/replies`)만 가능 |

## 2. TO-BE / 개선 효과
- 읽기 경로를 서명 API로 전환: 운영자 계정 의존(비밀번호 보관·12h 재로그인) 제거, 키 스코프 최소권한, 로테이션 체계 편입.
- `messages?since_id=` 단일 증분 커서로 **N+1 폴링·워터마크·naive-timestamp 함정 자체가 소멸**, `truncated`로 갭이 침묵 아닌 신호가 됨.
- `instance` + Expected-Customer로 **잘못된 인스턴스 지향(타 고객 데이터 오수신)을 저장 전에 차단**.
- 회신(send)·확인(confirm 중 commands/:id는 전환 가능)은 §3 결정에 따름.

## 3. 미결정
| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| D1 | 회신 경로 | (a) 하이브리드: 읽기=서명 키, 회신=기존 운영자 계정(필드 공존) (b) KSR에 `send:replies` 라우트 추가될 때까지 읽기만 전환 | **(a)** — 회신 기능 무중단. KSR 라우트가 열리면 회신도 전환(후속) |
| D2 | 기존 채널 전환 | (a) 신규 필드 설정 시 서명 모드, 미설정 채널은 레거시 유지(무중단) (b) 일괄 강제 전환 | **(a)** — 채널1 운영 중단 없이 점진 전환 |
| D3 | Expected-Customer | 채널 설정에 선택 입력(설정 시 pull마다 검증) | 포함 권장(값=KSR instance의 customerRef, KSR 콘솔에서 확인) |

## 4. 제약
- 스키마 무변경 예상: 자격증명은 기존 채널 JSON 필드 재사용(key_id/secret/expected_customer 추가).
- 검증에 쓴 테스트 키(`ksrk_e09cc7a0…`, 로컬 dev)는 실운영 키와 별개 — 스테이징 전환 시 스테이징 relay 콘솔에서 발급 필요.
- 논스/스큐 특성상 ShopTalk 서버 시계가 relay와 300s 이내여야 함(현 스테이징 동일 호스트라 무위험).
