# RPT — 라이브챗 개선 6종 구현 보고서

| | |
|---|---|
| Doc ID | CHATWIDGET-RPT-LCIMP-1.0.0 |
| 작성일 | 2026-08-13 |
| 선행 | REQ-260810 ×2 → PLN-260810 ×2 → 구현 → `TCR-260813-LiveChat-Improvements` |
| 상태 | **구현·테스트·스테이징 배포·실행 완료** / 프로덕션 미적용 |

---

## 1. 무엇이 달라졌나

세 줄로 요약됩니다.

1. **상담원이 잡은 대화가 더 이상 막다른 길이 아닙니다.** 이전에는 `agent` 상태에서 나가는 길이 대화 종료뿐이었고, 그 결과 스테이징에 **아무도 답하지 않은 고객 메시지 10건**이 최장 41일간 남아 있었습니다.
2. **아무도 손대지 않는 대화가 스스로 마무리됩니다.** 30분 침묵 → "더 도와드릴 일이 있으실까요?" → 1분 무응답 → 종료 + 만족도 질문.
3. **상담사가 지식을 조회하고, 답변을 전달하고, 그 답변을 지식으로 승격 제안할 수 있습니다.** 승격은 지식 소유자 승인을 거칩니다.

| 지표 | 이전 | 이후 |
|---|---|---|
| 방치 대화(`agent`+`waiting`) | **30건** | **4건** (전부 이메일 회신 대기 — 의도된 제외) |
| 답 없는 고객 메시지 | 10건 | **1건** (이메일로 회신할 건) |
| 상담원 만족도(`csat_avg`) | 전 상담원 `—` | **첫 값 기록**(agent 1 / 5.00) |
| 상담사의 지식 조회 | 불가(권한 없음) | 가능(읽기 전용) |
| 상담사가 만든 답변의 지식화 | 경로 없음 | 제안 → 승인 → 즉시 검색 |

---

## 2. 단계별 결과

| 단계 | 내용 | PR | 커밋 | 스키마 |
|---|---|---|---|---|
| **S1** | AI 재위임 | **#225** | `72e9a56` | 없음 |
| **P1** | 방치 확인 질문 + 자동 종료 | **#228** | `48d0b21` | **있음** |
| P1-fix | 순회 로그가 무언 종료 누락 | **#229** | `8c828fb` | 없음 |
| **P2/P3** | 만족도 API + 위젯 별 5개 | **#230** | `5bc0445` | (P1에 포함) |
| **S2/S3** | 지식 조회 + 초안 전달 | **#232** | `14ec14f` | 없음 |
| **S4** | 제안 → 승인 → 확정 지식 | **#247** | `254c1f6` | **있음** |

---

## 3. 설계에서 의도적으로 선택한 것

**재위임은 세 가지를 함께 되돌립니다.** 상태·배정·`agent_id`. 마지막이 미묘한데, 봇 침묵 규칙이 `waiting && agentId != null`에도 걸리므로 **id를 남긴 채 넘기면 다음 대기 때 같은 무응답이 재발**합니다. 테스트가 이 한 줄을 고정합니다.

**타이머가 아니라 컬럼입니다.** 30분과 60초를 타이머 두 개로 재면 프로세스와 함께 죽어 대화가 반쯤 닫힌 채 남습니다. `idle_prompt_at` 하나가 재시작을 견디고, 동시에 **"한 번만 묻기" 래치** 역할을 합니다.

**끝내지 말아야 할 대화가 있습니다.** 오프아워 이메일 회신을 약속한 대화(`reply_channel='email'`)를 자동 종료하면 **고객에게 약속한 답변이 사라집니다.** 제외 필터를 질문·종료 **두 패스 모두**에 넣었습니다 — 질문만 막으면 질문 후 오프아워로 넘어간 대화가 그대로 종료되는 구멍이 남습니다.

**7일 넘은 방치는 말 없이 닫습니다.** 41일 전 대화에 갑자기 "더 도와드릴까요?"는 서비스가 아니라 오작동으로 읽힙니다.

**권한을 넓히는 대신 표면을 좁게 만들었습니다.** 상담사에게 `knowledge_source.manage`를 주면 문서 생성·삭제까지 열립니다. 이미 가진 `conversation.handle`로 도는 별도 컨트롤러를 만들고 **메서드를 두 개(`ask`·`propose`)로 제한**했으며, 테스트가 그 형태와 "제안이 문서를 만들지 않음"을 고정합니다.

**전달에 새 발송 경로를 만들지 않았습니다.** 기존 상담원 메시지 경로를 그대로 써서 모더레이션·감사·타이핑 표시·푸시가 따라오고, **메시지는 상담원 것으로 저장**됩니다 — AI가 쓴 문장이어도 보내기로 결정한 건 사람입니다.

**제안에는 FK를 걸지 않았습니다.** 이 프로젝트는 하드 삭제(SPEC §13)라, 문서와 함께 제안이 사라지면 **누가 무엇을 승인했는지가 지워집니다.**

**만족도 평균은 누적이 아니라 재계산입니다.** 재평가가 평균을 이중 계산하지 않고 교정하며, 재평가를 허용한 이유는 고칠 수 없는 오클릭이 데이터를 더 나쁘게 만들기 때문입니다.

---

## 4. 오래 비어 있던 자리 하나

`agent_daily_stats.csat_avg`는 콘솔을 만들 때부터 있던 컬럼인데 **값을 쓰는 코드가 한 줄도 없었습니다.** 매퍼(`agent.mapper.ts:78`)를 거쳐 상담원 통계의 만족도 셀까지 배선돼 있었고, 그 셀은 지금까지 모든 상담원에 대해 `—`였습니다. P2가 첫 기록자입니다.

---

## 5. 파일

### 신규
```
apps/api/src/domain/chat/idle-conversation.service.ts (+spec)
apps/api/src/domain/chat/chat.service.csat.spec.ts
apps/api/src/domain/knowledge/agent-knowledge.controller.ts (+spec)
apps/api/src/domain/knowledge/answer-proposal.service.ts (+spec)
apps/api/src/domain/knowledge/entity/kb-answer-proposal.entity.ts
apps/api/src/domain/agent/agent.service.handback.spec.ts
apps/widget/src/components/chat/CsatCard.tsx
sql/migration_conv_idle_csat.sql · sql/migration_kb_answer_proposals.sql
```

### 주요 수정
```
apps/api/src/domain/agent/{agent.service.ts, agent-console.controller.ts}
apps/api/src/domain/chat/{chat.service.ts, chat.controller.ts, chat.mapper.ts, chat.module.ts,
                          entity/conversation.entity.ts, dto/request/chat.request.ts}
apps/api/src/domain/knowledge/{knowledge.controller.ts, knowledge.module.ts, dto/request/knowledge.request.ts}
apps/api/src/domain/ai-engine/entity/tenant-ai-config.entity.ts   (handbackNotice)
apps/api/src/global/constant/error-code.constant.ts               (E5028)
apps/web/src/domain/live-chat/{LiveChatPage.tsx, live-chat.service.ts, live-chat.hooks.ts}
apps/web/src/domain/knowledge/{KnowledgePage.tsx, knowledge.service.ts, knowledge.hooks.ts}
apps/widget/src/{hooks/useChat.ts, services/chatService.ts, components/chat/ChatTab.tsx, i18n/locales/*}
packages/types/src/api/widget.types.ts                            (csatRating·canRate)
CONFIG.md · env/backend/.env.development · docker/staging/.env.staging.example
```

---

## 6. 테스트

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **45건** |
| API 전체 | **1,004 passed / 100 suites** (작업 전 917) |
| typecheck · build | 9/9 · 통과 |
| 실환경 시나리오 | S1·P1·P2/P3·S2/S3·S4 전부 통과 — `TCR-260813` 참조 |

---

## 7. 배포 상태

| 환경 | 코드 | 마이그레이션 | 상태 |
|---|---|---|---|
| main | `254c1f6` (S4 기준) | — | 머지 완료 |
| **staging** | 동일 | **2건 적용 완료** | **배포·실행 완료 2026-08-10 ~ 08-12** |
| production | 미배포 | 미적용 | 대기 |

- 백업: `/home/shoptalk/backup-conversations-20260810.sql`
- 마이그레이션: `migration_conv_idle_csat.sql`(P1) · `migration_kb_answer_proposals.sql`(S4) — **둘 다 코드보다 먼저 적용**
- 운영 환경변수(기본값으로 동작): `IDLE_SWEEP_INTERVAL_SEC=30` · `IDLE_PROMPT_AFTER_MIN=30` · `IDLE_CLOSE_AFTER_SEC=60` · `IDLE_STALE_AFTER_DAYS=7`

---

## 8. 배포 중 발견해 고친 것

| # | 결함 | 어떻게 드러났나 | 조치 |
|---|---|---|---|
| D1 | 순회 로그가 **무언 종료를 세지 않음** | 백필 로그가 `asked 20, closed 0`인데 감사 로그는 `idle_closed 33` | PR #229 — `closed without asking`을 별도 항목으로 출력 |

> 운영자가 실제로 읽는 신호가 0을 보고하는 동안 13건이 종료돼 있었습니다. 감사 로그와 운영 로그가 어긋나면 **믿는 쪽이 틀립니다.**

---

## 9. 남은 일

| # | 내용 | 비고 |
|---|---|---|
| O1 | **AI가 상담원 연결을 약속하고도 이관하지 않음** | 이번 범위 밖의 기존 동작. 자동 이관 3분기(정책·모더레이션·저신뢰) 어디에도 걸리지 않는 "충분히 자신 있는" 답변이 원인. 별도 판단 필요 |
| O2 | 세션 언어 고정으로 안내 문구 언어 불일치 | 위젯이 첫 메시지 언어로 세션 언어를 갱신할지 결정 필요 |
| O3 | 프로덕션 배포 | 마이그레이션 2건 선적용 필요 |
| O4 | 재위임 안내 문구 IVY 확정본 | 현재 기본 문구로 운영 중이며 `/ai-setting`에서 편집 가능 |
