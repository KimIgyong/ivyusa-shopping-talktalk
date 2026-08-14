# PLN-260814-KSR-Provider-Signed-Client

REQ-260814-KSR-Provider-Signed-Client 구현 계획. 스키마 변경 없음(채널 JSON 필드 재사용).

## S1. 서명 유틸 (`apps/api/src/domain/messenger/ksr-signature.util.ts`)
- `canonicalString({method, pathWithQuery, timestamp, nonce, body})` + `signKsr(secret, canonical)` → `v1=` + 64소문자 hex.
- 규격 함정 2종을 단위테스트로 고정: ① 경로는 접두사·쿼리 **보낸 그대로**(재정렬 금지) ② hex 64자 소문자.
  스펙 문서의 빈 바디 예시(`e3b0c442…`)를 테스트 벡터로 포함.

## S2. BtbzRelayAdapter 서명 모드 (D1a/D2a — 하이브리드·점진 전환)
- 채널 필드 추가: `key_id`, `api_secret`(secret), `expected_customer`(선택). **`key_id`+`api_secret` 설정 = 서명 모드**, 미설정 = 현행 레거시 경로 그대로(코드 분기, 기존 채널 무영향).
- 서명 모드 동작:
  - `test()`: `GET /api/provider/v1/instance` (+`X-KSR-Expected-Customer`) — 연결·바인딩 동시 검증, E5101 은 명시 메시지로 표시
  - `pull()`: `GET /messages?since_id={채널 커서}` 증분(페이지네이션 `nextCursor`/`hasMore` 소진), `truncated=true` 시 `logger.warn` + 계속. 대화 메타(스레드 표시명·reply_enabled)는 신규 externalThreadId 등장 시에만 `GET /conversations/:id` 보충 — N+1 소멸. 채널 단위 커서는 기존 ThreadCursor 구조와 별도로 Redis `ksr:pcursor:{channelId}` 유지(스키마 불변)
  - `confirm()`: `GET /commands/:id` 단건
  - `send()`: **레거시 유지**(운영자 email/password 필요 — 하이브리드) — KSR `send:replies` 라우트 공개 시 후속 전환
- 모든 서명 요청은 요청 직전 `ts/nonce` 생성, 재시도 시 **재서명**(논스 재사용 409 함정 방지 — 8/14 T9로 확인).

## S3. 콘솔 채널 설정 폼 (/settings 메신저 → btbzRelay)
- 필드 3종 추가(key_id · API secret(마스킹) · expected customer), 설명문구 "설정 시 서명 API로 읽기, 회신은 운영자 계정 사용". i18n en/es/ko.

**UI 와이어프레임** (기존 채널 폼에 섹션 추가):
```
┌ btbz relay 채널 설정 ─────────────────────┐
│ 서버 URL   [https://messenger.amoeba.site]│
│ ── 운영자 계정(회신용) ──                  │
│ email     [__________]  password [______] │
│ ── Provider API 키(읽기·서명) 신규 ──      │
│ Key ID    [ksrk_____________]             │
│ Secret    [••••••••••••] (저장 후 미표시) │
│ Expected customer [________] (선택)       │
│              [연결 테스트]  [저장]         │
└───────────────────────────────────────────┘
```

## 사이드 임팩트
| 영역 | 영향 | 대응 |
|---|---|---|
| 운영 중 채널1(amoebaorder) | 없음 — 서명 필드 미설정이면 기존 경로 그대로 | 분기 회귀 테스트 |
| 커서 의미 변화 | 서명 모드는 채널 단위 since_id, 레거시는 스레드별 커서 | 모드 전환 시 since_id=0 시작 → 중복은 기존 externalMessageId 멱등으로 흡수(ingest dedup 확인) |
| 시계 스큐 | ShopTalk↔relay 300s 초과 시 E1104 | test()에서 스큐 에러를 구분 메시지로 노출([[fail-classification-copy]] 원칙) |
| 시크릿 보관 | 기존 channelField secret 경로(AES) 재사용 | — |

## 테스트·검증
- 단위: 서명 벡터(스펙 예시)·재정렬/대문자 함정·pull 페이지네이션·truncated·E5101/E1104 분기·레거시 모드 무회귀.
- 로컬 통합: 8/14 발급 테스트 키로 로컬 relay(:8099) 대상 test/pull/confirm 실호출.
- 스테이징: relay 콘솔에서 실키 발급 → 채널1 복제 채널로 서명 모드 검증 후 채널1 전환(D2a).

## PR
1개 PR: 유틸+어댑터+콘솔 폼+TCR (api·web).
