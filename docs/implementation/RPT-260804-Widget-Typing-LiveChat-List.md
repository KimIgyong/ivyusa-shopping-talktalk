# RPT — 위젯 타이핑 인디케이터 + /live-chat 목록 개선 (2026-08-04)

> REQ `docs/analysis/REQ-260804-Widget-Typing-LiveChat-List.md` ·
> PLN `docs/plan/PLN-260804-Widget-Typing-LiveChat-List.md` (승인: 전체+인덱스+대화방 5s) ·
> TCR `docs/test/TCR-260804-Widget-Typing-LiveChat-List.md`

## 1. 무엇이 바뀌었나

1. **위젯 답변 대기 인디케이터** — 전송 즉시 ●●● pulse 버블: AI 대기 "답변을 작성 중입니다…",
   상담사 연결 상태에선 "담당자가 답변을 작성 중입니다…"를 사람 답변 폴링 수신까지 유지.
   대화 status(ai_active/waiting/agent)를 `useChat`이 노출(기존 응답 필드 활용, 서버 무변경).
2. **/live-chat 목록** — 개설시간·마지막답변시간(상대시간+절대시각 툴팁), 미리보기 정합 수정
   (`lastMessagePreview` — 항상 '—'였던 버그), **고객명/이메일 검색 박스**(300ms 디바운스,
   최근 고객 500명 창 — 암호화 제약, 기존 고객검색과 동일 방식), 목록 폴링 15s→5s,
   **열린 대화방 5s 자동 갱신 추가**(고객 새 메시지가 상담사 조작 없이 표시 — REQ에서 발견한 결함).
3. **API** — `toSessionResponse.lastMessageAt` 추가(추가 쿼리 0), `GET /agent/sessions?q=`,
   마지막메시지 조회 select 축소(retrieval_trace 제외), `namesByIds` id+name만 복호화,
   `conversations (tenant_id,status,id)` 복합 인덱스(예방적 성능).

참고: REQ 실측상 API는 4~21ms — "목록 느림"의 실체는 폴링 구조였고 2번이 직접 해결.

## 2. 변경 파일

| 영역 | 파일 |
|---|---|
| widget | `src/hooks/useChat.ts`(status 노출), `src/components/chat/TypingBubble.tsx`(신규), `ChatTab.tsx`, `i18n/locales/{en,es,ko}.ts` |
| web | `domain/live-chat/{LiveChatPage.tsx, live-chat.hooks.ts, live-chat.service.ts}`, `i18n/locales/{en,es,ko}/livechat.json` |
| api | `domain/agent/{agent.service.ts, agent.mapper.ts, agent-console.controller.ts, dto/request/agent.request.ts, agent.service.listsessions.spec.ts(신규)}`, `domain/customer/customer.service.ts`, `domain/chat/entity/conversation.entity.ts` |
| sql | `sql/migration_conv_list_index.sql`(신규), `sql/01-schema.sql` |

## 3. 테스트 결과

- 신규 단위 5건 포함 apps/api jest **47 suites / 490 tests PASS**.
- `npm run typecheck` / `npm run build` 전체 통과, API 실부팅 확인.

## 4. 배포 상태

| 항목 | 값 |
|---|---|
| PR | #107 `feature/typing-livechat-list` → main, squash |
| 커밋 | `4ac855e` (main) |
| 마이그레이션 | `sql/migration_conv_list_index.sql` — 스테이징 **선적용 완료**(SHOW INDEX 확인) / 프로덕션 미정 |
| 스테이징 배포 | **완료** (2026-08-04, deploy-staging.sh; API 부팅·health OK) |

## 5. 스테이징 검증 기록 (2026-08-04)

| 체크 | 결과 |
|---|---|
| `idx_conv_tenant_status_id` 인덱스 | OK (tenant_id, status, id) |
| API 부팅 `successfully started` / `GET /health` | OK |
| `GET /agent/sessions?q=` 무인증 | **401** = 라우트 배포됨 |
| 배포된 위젯 번들에 typing 인디케이터 포함 | OK (`typingAgent` 2건) |

잔여(실브라우저 실측 — TCR S1~S8): 위젯 전송 인디케이터, 상담사 모드 유지,
목록 시간/검색/5초 갱신, 열린 대화방 자동 갱신 — 사용자 확인 대기, 결과 본 문서 추기.
