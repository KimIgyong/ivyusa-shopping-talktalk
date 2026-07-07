# PLAN — 시나리오 응답 · RAG 폴백 핸드오프 · 상담사 알람 / Scenario Replies · RAG Fallback Handoff · Agent Alerts

- 문서 ID: PLAN-Scenario-Handoff-Alert-20260707
- 관련: FR-003(시나리오 버튼), FN-015~017(intent/RAG), FR-015(에스컬레이션), FR-045/066/067(상담 콘솔), FR-069(모더레이션), SEQ-03/05
- 참고 KB: docs/guide/KB-US-Cosmetics-CS-Policy-Reference-20260707.md (CS 정책 시드)

## 1. 요구사항 / Requirements

1. (FR-S1) 미국 쇼핑몰 방문 고객 대상 웹챗 위젯에 **시나리오 기반 응답** 제공 — 주문/상품/배송/취소/환불 5개 도메인. 버튼·quick-reply 클릭 시 결정적(deterministic) 스크립트 응답, en/es/ko 현지화.
2. (FR-S2) 시나리오 밖 자유 질문은 **RAG AI 챗봇**이 응답(기존 FN-016/017 유지).
3. (FR-S3) RAG가 지식 내 답변을 찾지 못하면(저신뢰) **"관리자에게 전달하여 상담을 이어가겠습니다"** 문구를 노출하고 상담사에게 알람 — ① 콘솔 알람 모달 ② 이메일 ③ Slack(웹훅).
4. (FR-S4) 알람을 받은 상담사는 콘솔에서 **해당 대화창을 열어 고객과 대화를 이어간다**(기존 accept/message 재사용). 고객 위젯은 상담사 메시지를 실시간(폴링) 수신.

## 2. 현행 갭 분석 / Gap Analysis

| # | 현행 | 갭 |
|---|---|---|
| G1 | 시나리오 버튼 클릭 → 템플릿 문장을 RAG로 전송 | 결정적 시나리오 스크립트/후속 quick-reply 없음 |
| G2 | `chat.escalate()`가 `EVENTS.ESCALATION` 발행 | **구독자 없음** — 알람 미발송. 저신뢰 시 이벤트 미발행 |
| G3 | 저신뢰 시 AI 답변 + "상담원 연결할까요?" 노출 | 요구 문구·자동 핸드오프 아님 |
| G4 | `getOrCreateConversation`이 `ai_active`만 재사용 | waiting/agent 상태에서 고객 발화 시 **새 대화 생성** 버그 |
| G5 | 위젯이 대화를 최초 1회만 로드 | 상담사 답장 수신 불가 → 폴링 필요 |
| G6 | 콘솔은 15초 큐 폴링만 | 알람 모달/이메일/Slack 없음 |

## 3. 설계 / Design

### 3.1 시나리오 엔진 (API: `domain/chat/scenario.service.ts`)
- 스크립트 테이블: `action → { reply(en/es/ko), followUps[] }`. DB 아닌 코드 상수(v1) — 시드 CS 정책과 문구 정합 유지.
- 액션 셋: `cancel_refund`(루트 메뉴) / `cancel_order` / `refund_policy` / `return_exchange` / `shipping_policy` / `order_help` / `product_help_general` + 제어 액션 `agent_connect`(에스컬레이션), `my_orders`(위젯 탭 전환).
- `POST /api/v1/chat/scenario` `{session_token, action}` (@Public) → 버튼 라벨을 user 메시지로, 스크립트를 ai 메시지(`retrievalTrace={scenario}`)로 영속화 후 `{reply, followUps}` 반환.
- 시나리오 응답도 모더레이션 게이트 통과(FR-069 비우회 원칙 유지).

### 3.2 RAG 폴백 핸드오프 (chat.service)
- `answer.confidence < 0.45` → AI 답변 대신 시스템 문구 `handoff`(ko: "관리자에게 전달하여 상담을 이어가겠습니다.") 영속화, `status=waiting, escalated=1`, `EVENTS.ESCALATION{tenantId, conversationId, sessionId, reason:'low_confidence', preview}` 발행.
- 모더레이션 BLOCKED 경로도 동일 이벤트 발행(reason:'moderation_blocked').
- G4 수정: `ai_active|waiting|agent` 재사용. `waiting|agent` 상태의 고객 발화는 RAG를 타지 않고 영속화만(상담사 응대 모드), `reply:null` 반환.

### 3.3 상담사 알람 (agent 도메인 + infra)
- 엔티티 `agent_alerts`: tenant_id, conversation_id, session_id, reason, preview, status(new/acked), acked_by/at.
- `AgentAlertService`: `EVENTS.ESCALATION` 구독 → ① alert row 생성(콘솔 모달용) ② Slack Incoming Webhook POST(`SLACK_WEBHOOK_URL`) ③ SMTP 이메일(`SMTP_*`, `ALERT_EMAIL_TO`, nodemailer 동적 로드 — 미설정/미설치 시 로그 폴백). 채널 실패는 개별 격리(알람 저장은 항상 수행).
- API: `GET /agent/alerts?status=new`, `POST /agent/alerts/:id/ack` (CAPABILITY.CONVERSATION_HANDLE).

### 3.4 위젯 (apps/widget)
- `useChat`: 대화 폴링(5s, 전송 중 제외) — 서버 메시지로 리컨실 → 상담사 메시지 수신(FR-S4).
- 시나리오 클릭 → `/chat/scenario` 호출, 응답의 `followUps`를 quick-reply 칩으로 렌더. `agent_connect`는 기존 escalate API.
- 핸드오프/시스템 문구는 서버가 `session.language`로 현지화하여 내려줌(위젯 하드코딩 없음).

### 3.5 콘솔 (apps/web)
- `EscalationAlarm`(AppLayout 전역): `GET /agent/alerts?status=new` 10s 폴링 → 신규 알람 모달 표시 → [상담 열기] 클릭 시 ack 후 `/live-chat?c={conversationId}` 이동, LiveChatPage가 쿼리 파라미터로 해당 대화 자동 선택 → accept → 기존 메시지 전송으로 상담 지속.

### 3.6 시퀀스 (핸드오프)
```
고객(위젯) → chat/message → intent → RAG(conf<0.45)
  → [handoff 문구 노출] + conversation.status=waiting
  → EVENTS.ESCALATION → AgentAlertService
      ├ agent_alerts INSERT ─→ 콘솔 모달(10s 폴링)
      ├ Slack webhook
      └ SMTP email
상담사: 모달 [상담 열기] → live-chat?c=id → accept → message
고객(위젯): 5s 폴링으로 agent 메시지 수신 → 대화 지속
```

## 4. 환경 변수 (env/backend/.env.development)
`SLACK_WEBHOOK_URL`(빈값=비활성), `SMTP_HOST/PORT/USER/PASS`, `ALERT_EMAIL_FROM/TO`(빈값=비활성).

## 5. 한계 / 후속 (Open)
- 폴링 기반(위젯 5s/콘솔 10s) — WebSocket/SSE 전환은 후속 과제.
- 시나리오 스크립트 v1은 코드 상수 — 콘솔 관리 UI(FR-047 확장)는 후속.
- 이메일은 nodemailer 설치(`npm i` 재실행) 필요; 미설치 시 로그 폴백으로 동작.
