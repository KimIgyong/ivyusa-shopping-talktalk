# PLN-260812-Reply-Approval-Mode

AI 응답 **승인 모드**(초안 → 상담원 발송) + 메신저 채널 **자동종료/CSAT 제외** 작업계획서.

- 근거: `REQ-260812-Per-Session-AutoReply` (§6 D-3 확장) · 2026-08-12 사용자 결정
  - "승인 모드로 진행 / 메신저 채널은 자동종료·CSAT 제외 / 세션별 AI 답변 온·오프"
- 규모: PR 1건, 스키마 변경 2건(채널 응답모드, 초안 테이블)

## 0. 결정

| ID | 결정 | 이유 |
|---|---|---|
| D-1 | 자동응답 불리언을 **응답모드 3상태**(`off`/`approve`/`auto`)로 승격 | "끔/승인/자동"은 서로 배타적인 한 축이다. 불리언 + 승인 플래그로 쪼개면 조합 4개 중 2개가 무의미해진다 |
| D-2 | 채널 = 기본값, 세션 = override(`inherit` 포함 4상태) | 기존 구조 유지. 세션이 채널을 이긴다 |
| D-3 | 초안은 **별도 테이블**(`reply_drafts`) | `messages`에 넣으면 위젯 폴링과 릴레이 아웃박스가 **승인 전 초안을 고객에게 발송**한다. 절대 불가 |
| D-4 | 승인 발송은 **기존 상담원 답장 경로** 재사용 | 모더레이션·중복억제·아웃박스 릴레이가 이미 그 경로에 있다. 두 번째 발송 경로를 만들지 않는다 |
| D-5 | 초안이 생기면 **대화를 이관**한다(대화당 1회) | 사람이 봐야 나가는 답이다. 대기열에 뜨지 않으면 초안은 잊힌다 |

## 1. 스키마 (`sql/migration_reply_approval.sql`)

```sql
-- 채널 기본 응답 모드. 기존 auto_reply(0/1)에서 백필한다.
ALTER TABLE messenger_channels
  ADD COLUMN reply_mode VARCHAR(8) NOT NULL DEFAULT 'auto' AFTER auto_reply;
UPDATE messenger_channels SET reply_mode = CASE WHEN auto_reply = 1 THEN 'auto' ELSE 'off' END;

-- 승인 대기 중인 AI 초안. 메시지가 아니다 — 승인 전에는 고객에게 나가지 않는다.
CREATE TABLE reply_drafts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  message_id BIGINT NULL,                 -- 이 초안을 유발한 고객 발화
  body TEXT NOT NULL,
  confidence DECIMAL(4,3) NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',  -- pending|sent|discarded
  resolved_by BIGINT NULL, resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rd_conv_status (conversation_id, status),
  KEY idx_rd_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
`sessions.auto_reply_mode`는 컬럼 변경 없이 값 집합만 확장(`inherit|off|approve|auto`, varchar(8)에 수용).
롤백: 두 테이블 변경을 되돌린다(`reply_mode` 드롭, `reply_drafts` 드롭). `auto_reply`는 계속 동기화하므로
코드를 롤백해도 기존 동작이 유지된다.

## 2. 백엔드

**S1. 모드 판정 한 곳** — `resolveReplyMode(channelMode, sessionMode): 'off'|'approve'|'auto'`
상담원 점유는 호출부에서 계속 최우선. 기존 `resolveAutoReply`는 `mode !== 'off'`로 정의되는 얇은 래퍼로 남긴다(콘솔 뱃지용).

**S2. 초안 생성** — `ChatService.handleUserMessage(session, text, { draft: true })`
동의·의도·deny-list·RAG·**모더레이션**까지 완전히 동일하게 통과한 뒤, AI 턴을 저장하는 대신 본문을 반환한다.
- 저장하지 않는 이유: 저장하는 순간 위젯 폴링과 아웃박스가 **승인 없이** 고객에게 보낸다.
- **재사용(answer-reuse) 기록도 하지 않는다** — 아무도 승인하지 않은 답을 검증된 답으로 학습시킬 수 없다.
- 이관/저신뢰/차단 분기는 그대로다: 자신 있는 답이 없으면 제안할 것도 없다.

**S3. 인입 분기** (`messenger-ingest.service.ts`)
`auto` → 지금과 동일 · `approve` → 초안 생성·저장 + 대화 이관(1회) · `off` → 저장 + 이관(1회)

**S4. 승인/폐기 API** (`domain/agent`, `CONVERSATION_HANDLE`)
- `POST /agent/conversations/:id/draft/approve { body? }` — 편집본이 오면 그것으로, 없으면 초안 그대로
  **기존 `AgentService.reply`** 를 태워 발송(모더레이션·중복억제·아웃박스) 후 초안 `sent`
- `POST /agent/conversations/:id/draft/discard` — `discarded`
- 대화 상세 응답에 `pendingDraft`(본문·신뢰도·생성시각) 동봉

**S5. 자동종료/CSAT 제외**
`IdleConversationService`의 두 후보 쿼리에서 **외부 메신저 대화를 제외**한다(위젯/미지정만 대상).
카카오톡 대화방은 "유휴"라는 개념이 맞지 않고, 개인 대화방에 "만족도를 평가해주세요"가 발송된
실사례가 있다(스테이징 52건).

## 3. 콘솔

**S6. 세션 모드 4상태** — 헤더 셀렉트가 `기본값 따름 / 자동 / 승인 / 끔`, 뱃지에 `승인 대기` 추가
**S7. 초안 패널** — 작성창 위에 `AI 제안` 카드: 본문(편집 가능) + [승인 후 발송] [폐기] + 신뢰도·생성시각
**S8. 설정 카드** — 채널 자동응답 토글을 **응답 모드 셀렉트**(끔/승인/자동)로 교체, 기존 안내 문구 유지

```
┌ 대화 ───────────────────────────────────────────────┐
│ 강남점 사장님 Session a1b2c3 [카톡] [대기]           │
│ 응답 [승인 ▾]   ● 승인 대기                          │
│──────────────────────────────────────────────────────│
│ [고객] 재고 있나요?                            14:31 │
│┌ AI 제안 (신뢰도 0.82 · 14:31) ────────────────────┐│
││ 네, 현재 재고가 있습니다. 오늘 출고 가능합니다.    ││
││ [승인 후 발송] [폐기]                              ││
│└────────────────────────────────────────────────────┘│
│ [ 답장 입력…                                    ][↵] │
└──────────────────────────────────────────────────────┘
```

## 4. 사이드 임팩트

| 영역 | 영향 | 판단 |
|---|---|---|
| 위젯 | `draft` 옵션은 메신저 인입만 사용, 응답 타입에 선택 필드 추가 | 동작 불변 |
| 기존 채널 | `auto_reply`는 계속 동기화(코드 롤백 안전), 의미는 `reply_mode`로 이동 | 하위호환 |
| 답변 재사용 | 승인 모드 답변은 학습 대상에서 제외 | 의도됨(D-2 근거) |
| 자동종료 | 메신저 대화는 더 이상 자동종료·CSAT 대상이 아님 → 종료는 상담원이 | 요구사항 |
| 감사 | 승인/폐기는 상담원 행위로 기록 | 신규 |

## 5. 테스트 / 배포

- **단위**: 모드 판정 12종(채널3 × 세션4), 초안 모드에서 **AI 메시지 미저장·재사용 미기록**,
  저신뢰는 초안 대신 이관, 승인 시 상담원 답장 경로 호출·초안 `sent`, 폐기, 이관 1회,
  스위퍼가 메신저 대화를 건너뜀
- **통합**: 채널 `승인` → 인입 → 초안 생성 + 대기열 노출 → 승인 → 채널로 발송
- **Migration**: `sql/migration_reply_approval.sql` **코드 배포 전** 스테이징 선적용
