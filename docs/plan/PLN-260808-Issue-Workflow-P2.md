# PLN-260808-Issue-Workflow-P2

이슈 워크플로우 **P2 — 정책 라우팅·배정·Gorgias L1 커넥터** 작업계획서.

- 작성일: 2026-08-08 · 근거: REQ-260807-LiveChat-Issue-Workflow §5.3/§11.2 + 결정 4·10·11·12·13, P1 배포 완료(RPT-260808-Issue-Workflow-P1)
- ⚠️ **사용자 승인 후 구현 착수**

---

## 1. 단계별 계획

### S1. 스키마 (`sql/260808-issue-p2.sql`) — 외부 티켓 참조만
```sql
CREATE TABLE `external_tickets` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `conversation_id` BIGINT NOT NULL,
  `provider` VARCHAR(16) NOT NULL,            -- gorgias (P2), zendesk… (후속)
  `external_id` VARCHAR(64) NOT NULL,         -- Gorgias ticket id
  `last_relayed_message_id` BIGINT NULL,      -- append 멱등 커서
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_ext_conv` (`conversation_id`, `provider`),
  INDEX `idx_ext_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
- deny-list 설정은 `tenant_ai_config.handoff_config` JSON 확장(스키마 변경 불필요).

### S2. 정책 deny-list (강제 3차 + 강제 티켓, REQ §5.3)
- 설정: `handoffConfig.denyRules: [{ keywords: string[], type?: IssueType, label?: JobLabel }]`
  — 고객 메시지(스크럽본)가 키워드에 매칭되면 **신뢰도 무관 강제 핸드오프**.
- 파이프라인: 인텐트 분류 직후 deny 매칭 검사 → 매칭 시 **RAG/LLM 호출 생략**하고 `handoff(reason:'policy')`
  (EscalationReason에 `policy` 추가). 에스컬레이션 이벤트에 rule의 type/label 동봉 → 이슈 승격 시 스탬프.
- 콘솔: /settings HandoffSection에 deny-rules 편집(행: 키워드(쉼표구분)+유형+라벨, 추가/삭제, 저장 토스트).
```
│ 정책 강제 핸드오프 (deny-list)                          │
│ [키워드: 환불,반품취소] [유형: 환불 ▾] [라벨: 회계 ▾] [삭제] │
│ [+ 규칙 추가]                              [저장]        │
```

### S3. 라벨 자동배정 + 이관 + maxConcurrent (결정 4·10)
- **라벨 스탬프**: 이슈 생성 시 `assignee_label` = deny rule의 label ?? 기본 맵
  (cancel/refund→accounting, delivery→operations, partnership→operations, order_status/other→consult; 코드 상수 — 콘솔 설정화는 후속).
- **알림 타겟 좁히기**: 에스컬레이션 알림 대상 = 해당 라벨 보유 + status available + 활성 배정 < maxConcurrent 인 상담원
  (없으면 기존 broadcast 폴백 — 알림 유실 금지).
- **maxConcurrent 강제**: `accept()` 시 활성 배정 수 ≥ 프로필 maxConcurrent → 409 거절(+`logger.warn`).
- **이관/재배정**: `POST /agent/issues/:id/assign {user_id}` (manager 이상) → 기존 assignment `transferred` 처리 + 신규 active,
  이슈 assignee 갱신 + `assigned` 이벤트 + 감사. IssuePanel에 이관 드롭다운(테넌트 상담원 목록).

### S4. Gorgias L1 커넥터 (bridge 모드, 결정 11·12·13)
- **트리거**: ESCALATION 버스 구독(P1과 동일 패턴) — `workflow_mode='bridge'` + gorgias 자격증명(#191) 존재 시.
  native/base는 no-op → **모드 배타성 불변식**(§11.1) 자동 보장(한 세션은 네이티브 또는 외부 하나만).
- **생성**: `POST /api/tickets` Basic(email:REST key) — `customer.email`(dedup), `subject`(사유+미리보기),
  `messages[]` = 대화록 순서대로(`from_agent`, `created_datetime` 원 타임스탬프), `tags`=[reason, 'shoptalk'].
  **컨텍스트 패키징**: 전체 대화록 + 에스컬레이션 사유 + (있으면) 최근 주문 요약을 내부 노트 메시지로.
- **멱등/재-에스컬(결정 12)**: `external_tickets`(conversation unique)로 dedupe —
  기존 ref 있으면 신규 고객 메시지를 **append**(`POST /api/tickets/{id}/messages`, last_relayed 커서),
  없으면 생성. ⚠️ L1은 외부 open/closed를 모름 → "closed면 신규" 판단은 **L2(웹훅)에서** — P2는 append-always(Gorgias가 새 메시지로 재오픈).
- **가드**: 고객 이메일 없으면 전달 스킵+warn(Gorgias 고객 dedup 축이 email). 실패 비치명(재시도 1회) — 에스컬레이션 자체는 영향 없음.
- 스테이징: IVY USA(tenant 1)를 'bridge'로 전환하는 것은 **실 Gorgias 자격증명 등록 후 사용자 확인 하에**(전환 전까지 base 유지).

### S5. 테스트/배포
- 단위: deny 매칭(강제 핸드오프·LLM 미호출·type/label 스탬프), 알림 타겟 필터+broadcast 폴백, maxConcurrent 409,
  이관 권한(manager)·transferred 전이, Gorgias 페이로드(transcript 순서·from_agent)·dedupe/append·이메일 없음 스킵·모드 게이팅.
- 스테이징: SQL 선적용 → 배포. E2E: amoebaorder(native) deny 키워드 → 강제 티켓+라벨 확인; Gorgias는 실 계정 등록 후 bridge 테넌트로 검증.

## 2. 사이드 임팩트
| 영역 | 영향 | 판단 |
|---|---|---|
| AI 응답 경로 | deny 매칭 시에만 LLM 생략(명시 정책) — 그 외 불변; 답변재사용 조회보다 먼저 평가 | 의도된 동작 |
| 기존 알림 | 라벨 필터는 좁히기만, 대상 없으면 broadcast 폴백 | 안전 |
| accept | maxConcurrent 초과 시 409 신규 거절 — 프로필 미설정(기본값)은 현행 무제한 유지 | 안전 |
| base/native 테넌트 | Gorgias 커넥터 no-op | 안전 |
| PII | Gorgias 전달은 원문 대화록(헬프데스크 목적상 필요) — bridge 전환 자체가 테넌트의 처리위탁 결정임을 RPT에 명기 | 주의 |

## 3. 산출물/순서
PR-P2a(백엔드: S1~S4) → PR-P2b(콘솔: deny-rules 편집 + 이관 UI) → 스테이징 SQL 선적용·배포 → TCR/RPT.
