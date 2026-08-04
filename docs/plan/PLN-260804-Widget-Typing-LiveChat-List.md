# PLN — 위젯 답변 대기 인디케이터 + /live-chat 목록 개선 (2026-08-04)

> 근거: `docs/analysis/REQ-260804-Widget-Typing-LiveChat-List.md`
> 스키마 변경: **선택 1건** — `conversations (tenant_id,status,id)` 복합 인덱스(예방적 성능;
> Stage 3에 포함, 승인 시 `sql/migration_conv_list_index.sql` + 스테이징 선적용)
> ⚠️ 구현은 본 PLN 승인 후 시작.

## Stage 1 — 위젯 타이핑/대기 인디케이터

대상: `apps/widget/src/hooks/useChat.ts`, `components/chat/{ChatTab,MessageBubble 또는 신규 TypingBubble}.tsx`, `i18n/locales/{en,es,ko}.ts`

1. `useChat`: 대화 `status`(`ai_active/waiting/agent`)를 훅 반환값에 추가(폴링 응답에서 채택).
2. 신규 `TypingBubble` 컴포넌트: AI 버블 스타일 + ●●● 점 3개 pulse 애니메이션 + 문구.
   표시 조건:
   - `sending`(요청 in-flight) → `chat.typingAi` "답변을 작성 중입니다…"
   - `status ∈ {waiting, agent}` 이고 마지막 메시지가 고객 것일 때 →
     `chat.typingAgent` "담당자가 답변을 작성 중입니다…" (상담사 답변 폴링 수신 시 소멸)
3. 자동 스크롤 effect 의존성에 `sending`/인디케이터 추가(인디케이터가 화면 안으로).
4. i18n 3개 언어 키 추가.

와이어프레임 (채팅 탭):

```
│ 🧑 I have a question about order #1001   │  ← 고객(전송 직후)
│ ┌──────────────────────────────┐         │
│ │ ● ● ●  답변을 작성 중입니다…  │         │  ← TypingBubble (AI 대기)
│ └──────────────────────────────┘         │
│  (상담사 모드면: ● ● ● 담당자가           │
│   답변을 작성 중입니다…)                  │
└─[ 메시지 입력____________ ][전송(비활성)]─┘
```

## Stage 2 — /live-chat 목록 UI

대상: `apps/web/src/domain/live-chat/{LiveChatPage.tsx, live-chat.hooks.ts, live-chat.service.ts}`, `i18n/locales/{en,es,ko}/livechat.json`

1. 목록 항목에 **개설시간·마지막답변시간** 표시(상대시간 "5m ago" + title 툴팁 절대시각).
2. 필드 정합 수정: 클라이언트 타입/렌더를 `lastMessagePreview`·`lastMessageAt`으로 교정
   (미리보기 '—' 버그 해소).
3. **검색 박스**(고객명/이메일, 300ms 디바운스) → `GET /agent/sessions?q=` (Stage 3).
   검색 중임/한계(최근 고객 500명 범위) 안내 문구.
4. 갱신 주기: 목록 15s→**5s**, **열린 대화방에 5s refetchInterval 추가**(고객 새 메시지 자동 표시).

와이어프레임 (목록):

```
┌ Live chat ─────────────────────────────────┐
│ [🔍 고객명/이메일 검색_______________]      │
│ ┌────────────────────────────────────────┐ │
│ │ Kim Igyong            [agent]          │ │
│ │ 배송이 언제 되나요…                     │ │
│ │ 개설 10:12 · 마지막답변 2분 전          │ │
│ ├────────────────────────────────────────┤ │
│ │ Session a1b2c3        [waiting]        │ │
│ │ I have a question about…               │ │
│ │ 개설 09:58 · 마지막답변 15분 전         │ │
│ └────────────────────────────────────────┘ │
```

## Stage 3 — API (`GET /agent/sessions`)

대상: `apps/api/src/domain/agent/{agent.service.ts, agent.mapper.ts, agent-console.controller.ts}`, (선택) `sql/migration_conv_list_index.sql`

1. 응답에 `lastMessageAt` 추가 — 이미 조회 중인 마지막 메시지의 `createdAt`을 mapper에서 전달
   (추가 쿼리 0). `updatedAt`류 신규 컬럼은 만들지 않음(파생 값으로 충분).
2. `?q=` 검색 파라미터(snake_case, 선택): `CustomerService.searchByEmailOrName(q)`로 고객 id 확보
   → 해당 고객들의 세션 id → `conversations.session_id IN (...)` 필터. q 없으면 현행 동일.
3. 쿼리 슬리밍(체감보다 예방 성격):
   - 마지막메시지 조회 select를 `id, conversationId, body, createdAt`로 축소(`retrieval_trace` 제외)
   - `namesByIds` select를 `id, name`으로 축소(불필요한 email/phone 복호화 2회/행 제거)
4. (선택·승인 필요) `idx_conv_tenant_status_id (tenant_id, status, id)` 인덱스 추가 —
   현 규모(77건)에선 불필요하나 성장 대비. 포함 시 Migration 섹션 + 스테이징 선적용.

## 사이드 임팩트

| 영역 | 검토 | 판단 |
|---|---|---|
| 폴링 5s 단축 | 콘솔 1개당 sessions 12→36회/분, API 실측 4~21ms | 부하 미미 |
| 열린 대화방 5s 폴링 | 상담사 다수 동시 접속 시 conversation GET 증가 | 규모상 수용, 추후 SSE 후보 |
| 이름 검색 한계 | 최근 500 고객 범위(암호화 제약, 기존 선례와 동일) | UI 문구로 명시 |
| 위젯 인디케이터 | 표시 전용 — 전송/폴링 로직 무변경 | 회귀 위험 낮음 |
| `lastMessagePreview` 정합 | 죽은 필드(`channel`,`unread` 등) 정리 동반 | 타입만 정리 |
| 인덱스(선택) | 스키마 변경 → Migration 절차 필요 | 미포함 선택 가능 |

## 검증 계획 (TCR로 상세화)

- 위젯: 전송→인디케이터 표시→AI 답변 교체 / agent 모드 유지→폴링 수신 시 소멸 / 3개 언어.
- 콘솔: 시간 2종 표시, 미리보기 정상화, 고객명 검색 필터, 새 고객 메시지 5s 내 자동 표시.
- API: `?q=` 유/무, lastMessageAt 정확성, 단위 테스트(agent.service listSessions 검색 분기).

## 승인 요청

1. 이대로 진행 여부 (Stage 1~3)
2. **선택 항목**: Stage 3-4 복합 인덱스(스키마 변경 1건) 포함 여부 — 권고: 포함
3. 열린 대화방 5초 자동 갱신 포함 여부 — 권고: 포함(요구 "목록 느림" 체감의 실제 원인 중 하나)
