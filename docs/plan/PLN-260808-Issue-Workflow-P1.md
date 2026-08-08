# PLN-260808-Issue-Workflow-P1

라이브챗 이슈 워크플로우 **P1 — 이슈 코어**(티켓 엔티티·상태머신·승격 훅·엔타이틀먼트) 작업계획서.

- 작성일: 2026-08-08 · 근거: REQ-260807-LiveChat-Issue-Workflow(§5 초안 + §10b 결정 1·2·3·10 반영)
- 범위: **백엔드 중심 + 콘솔 최소 UI**(칸반은 P4, 고객 상태회신은 P3, 정책 라우팅·Gorgias L1은 P2)
- ⚠️ **사용자 승인 후 구현 착수**

---

## 1. 단계별 계획

### S1. 스키마 + 엔타이틀먼트 (`sql/260808-issues-p1.sql`)
```sql
-- 3-모드 엔타이틀먼트(§11.1): 서버 판정. P1엔 SQL로 수동 설정(콘솔 노출은 후속).
ALTER TABLE `tenants` ADD COLUMN `workflow_mode` VARCHAR(8) NOT NULL DEFAULT 'base';
  -- native(A: 애드온 구독) | bridge(B: 외부 헬프데스크) | base(C)

CREATE TABLE `issues` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `issue_no` INT NOT NULL,                    -- 테넌트별 시퀀스(max+1, count+1 금지)
  `conversation_id` BIGINT NOT NULL,          -- 결정1: 1:1 승격
  `session_id` BIGINT NOT NULL,
  `customer_id` BIGINT NULL,
  `type` VARCHAR(24) NOT NULL DEFAULT 'other',-- order_status|delivery|cancel|refund|partnership|other
  `status` VARCHAR(16) NOT NULL DEFAULT 'received', -- received|in_progress|resolved|rejected|closed
  `resolved_tier` VARCHAR(12) NULL,           -- scenario|ai|agent
  `priority` VARCHAR(8) NOT NULL DEFAULT 'normal',  -- normal|urgent (결정5: 2단계)
  `assignee_user_id` BIGINT NULL,
  `assignee_label` VARCHAR(24) NULL,          -- 결정4: 기존 라벨 축
  `reject_reason` VARCHAR(24) NULL,           -- 결정3: policy_impossible|misrouted|spam
  `resolution_note` VARCHAR(500) NULL,
  `reopen_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` DATETIME NULL, `closed_at` DATETIME NULL,
  UNIQUE KEY `uk_issue_no` (`tenant_id`,`issue_no`),
  UNIQUE KEY `uk_issue_conv` (`conversation_id`),
  INDEX `idx_issue_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `issue_events` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `issue_id` BIGINT NOT NULL,
  `actor_type` VARCHAR(8) NOT NULL,           -- system|ai|agent
  `actor_id` BIGINT NULL,
  `type` VARCHAR(16) NOT NULL,                -- created|status_changed|assigned|tier_advanced|memo|reopened
  `from_status` VARCHAR(16) NULL, `to_status` VARCHAR(16) NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ievt_issue` (`issue_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
- inquiry 스텁(결정1): 테이블은 존치(P3에서 위젯 Inquiries 탭을 이슈 피드로 전환할 때 정리), 신규 기능은 issues만 사용.

### S2. 백엔드 — `domain/issue/` 신규 모듈
1. **엔티티/모듈**: `issue.entity.ts`/`issue-event.entity.ts`(+타임라인), `IssueModule`(app.module 등록).
2. **생성 훅 (결정2 — 에스컬레이션만)**: `ChatService.handoff()`(low_confidence/moderation_blocked/user_request 공통 경로)에서
   `IssueService.openForConversation(tenantId, conversation, session, reason)` 호출 —
   - `workflow_mode !== 'native'`면 no-op(엔타이틀먼트 서버 판정, §11.1). 실패 비치명(에스컬레이션 자체는 영향 없음).
   - 기존 open 이슈 있으면 재사용(1:1 유지), 없으면 생성: issue_no=max+1, type=intent 매핑
     (needsOrderData→order_status, cancel/refund 인텐트→해당 유형, 그 외 other), customer/session 스탬프, `created` 이벤트.
   - "특정 유형 강제 티켓"(deny-list)은 P2 정책 라우팅과 함께.
3. **tier 스탬프**: 시나리오/AI 해소 대화는 이슈가 없으므로(결정2) tier는 3차 진입 후 축적 —
   상담원 accept 시 `tier_advanced(agent)` + `in_progress` + `assigned` 이벤트(기존 `AgentService.accept`에 훅).
4. **상태머신 + 권한(결정 3·10)**: `IssueService.transition(actor, issueId, to, {reason?, note?})`
   - 허용 전이: received→in_progress→resolved|rejected→closed, resolved|rejected→in_progress(재오픈, reopen_count++)
   - rejected는 reject_reason 필수(3코드), resolved/rejected → conversation `ENDED` 시 자동 closed(기존 end 경로에 훅)
   - 권한: 전이=담당자 또는 manager↑ / 반려·재배정=manager↑(`@RequireRank`+서비스 검증, 거절 시 `logger.warn`)
   - 모든 전이 `issue_events` + `AuditService.write`.
5. **API**(콘솔용 최소): `GET /agent/conversations/:id` 응답에 issue 요약 포함(있으면),
   `POST /agent/issues/:id/transition` `{to, reject_reason?, note?}`, `GET /agent/issues/:id/events`.
   목록/칸반 API는 P4.

### S3. 콘솔 최소 UI (라이브챗 3열 재활용 — 칸반 아님)
```
┌ 스레드 헤더 ──────────────────────────────────────────┐
│ 홍길동 · session#12  [#37 진행중 ▾]   [수락][종료]     │ ← 이슈 뱃지(번호+상태)
│                        └─ 드롭다운: 해결 / 반려 / 재오픈 │    native 테넌트만 노출
│  반려 선택 시 모달: 사유(정책불가/오분류/스팸)+메모      │
├──────────────────────────────────────────────────────┤
│ ▸ 이슈 타임라인 (접이식): 생성→배정→상태변경 이력       │
└──────────────────────────────────────────────────────┘
```
- i18n en/es/ko, 저장/전이 성공·실패 토스트(§4.3), `workflow_mode!=='native'` 테넌트는 완전 미노출(기존 화면 불변).

### S4. 테스트/배포
- 단위: 승격 훅(native만·1:1 재사용·issue_no 시퀀스), 상태머신(허용/불허 전이·반려 사유 필수·권한 매트릭스), end→closed 훅.
- 스테이징: amoebaorder를 `workflow_mode='native'`로 설정(A모드 파일럿, 결정14) → 실몰 에스컬레이션 → 이슈 생성·전이 E2E.
- Migration: **SQL 선적용 → 배포**(추가 전용, 롤백=코드 revert).

## 2. 사이드 임팩트
| 영역 | 영향 | 판단 |
|---|---|---|
| 기존 에스컬레이션/배정 | 훅 추가만(실패 비치명) — 알림·라우팅·수락 흐름 불변 | 안전 |
| base/bridge 테넌트 | workflow_mode 기본 'base' → 동작 완전 불변 (IVY USA는 추후 'bridge') | 안전 |
| 상담원 콘솔 | native 테넌트에만 뱃지/드롭다운 추가 | 안전 |
| 대화 종료(오늘 배포된 고객 종료 포함) | end 경로에 issue closed 훅 — open 이슈 없으면 no-op | 안전 |
| 스키마 | 신규 테이블 2 + tenants 컬럼 1(추가 전용) | 준수 |

## 3. 산출물/순서
PR-P1a(백엔드+SQL: S1+S2) → PR-P1b(콘솔 UI: S3) → 스테이징 SQL 선적용·배포·E2E → TCR/RPT.
후속: P2(정책 deny-list·라벨 자동배정·**Gorgias L1 커넥터**, 결정11) → P3(고객 상태회신·Inquiries 전환) → P4(칸반) → P5(지식 폐루프).
