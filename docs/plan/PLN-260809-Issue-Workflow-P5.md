# PLN-260809-Issue-Workflow-P5

이슈 워크플로우 **P5 — 지식 순환 폐루프**(지식갭 자동 제안 → 사람 승인 → KB 반영) 작업계획서. 로드맵 최종 단계.

- 작성일: 2026-08-09 · 근거: REQ-260807 §5.6 + **결정 9(자동제안 + 사람 승인까지만 — 자동승인 금지)**
- 재사용 자산: question_stats_daily/클러스터 배치 · best-answer→KB 캡처 · ai-coach · 답변재사용 · 이슈 tier
- ⚠️ **사용자 승인 후 구현 착수**

---

## 1. 단계별 계획

### S1. 스키마 (`sql/260809-issue-p5.sql`)
```sql
CREATE TABLE `knowledge_gap_tasks` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `source` VARCHAR(24) NOT NULL,     -- escalation_cluster | no_source | agent_resolution
  `ref_key` VARCHAR(64) NOT NULL,    -- cluster id / intent / issue id (멱등 축)
  `title` VARCHAR(300) NOT NULL,     -- 대표 질문(PII 스크럽본)
  `detail` TEXT NULL,                -- 답변 후보(상담원 해결답변) 또는 지표 요약
  `metric_json` JSON NULL,           -- {asked, escalated, noSource, rate…}
  `status` VARCHAR(12) NOT NULL DEFAULT 'proposed',  -- proposed|accepted|dismissed
  `decided_by` BIGINT NULL, `decided_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_gap` (`tenant_id`,`source`,`ref_key`),
  INDEX `idx_gap_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### S2. 백엔드 — 제안 생성 (PR-P5a)
1. **지식갭 배치**(`KnowledgeGapService`, knowledge 도메인): 일배치(env `KNOWLEDGE_GAP_INTERVAL_HOURS`
   기본 24h, 기존 question-stats 스케줄러 패턴). 최근 7일 `question_stat_daily`에서
   - cluster 차원: `asked ≥ 3 ∧ escalated/asked ≥ 0.5` → `escalation_cluster` 제안(대표질문=클러스터 라벨)
   - `no_source ≥ 3`인 intent → `no_source` 제안
   - uk_gap으로 멱등(재배치 시 지표만 갱신), dismissed 항목은 재제안 안 함.
2. **3차 해결답변 캡처 후보**: 이슈가 `resolved`(tier=agent)로 전이될 때 해당 대화의
   마지막 상담원 답변+직전 고객 질문을 `agent_resolution` 태스크로 제안(제목=질문 스크럽본, detail=답변).
   IssueService 전이 지점 훅(best-effort) — **자동승인 없음**(결정 9).
3. **API**(knowledge 캐퍼빌리티): `GET /knowledge/gap-tasks?status=` (paginated) ·
   `POST /knowledge/gap-tasks/:id/accept` → **기존 KB 문서 생성 파이프라인 재사용**
   (title/detail로 문서 생성 → 기존 자동 임베딩·Qdrant 인덱싱) + accepted 마킹·감사 ·
   `POST /knowledge/gap-tasks/:id/dismiss`.

### S3. 콘솔 — /knowledge "지식 갭 제안" 섹션 (PR-P5b)
```
┌ 지식 갭 제안 (5) ────────────────────────────────────────────┐
│ ⚠ 에스컬레이션 다발 · "립틴트 지속력 문의" (7일: 질문6·이관4)  │
│    [KB 문서로 승인] [기각]                                    │
│ 📄 근거문서 없음 · intent: shipping_policy (no-source 5)      │
│ 👤 상담원 해결 · "환불 계좌 변경되나요" — 답변 후보 첨부        │
│    ▸ 답변 미리보기(접이식)      [KB 문서로 승인] [기각]        │
└──────────────────────────────────────────────────────────────┘
승인 → 즉시 KB 문서 생성+임베딩(기존 파이프라인), 토스트. 기각 → 재제안 안 함.
```
- 승인 전 제목/본문 인라인 편집 가능(캡처 품질 확보). 처리 효과 확인은 기존 /statistics 재사용.

## 2. 사이드 임팩트
| 영역 | 영향 | 판단 |
|---|---|---|
| 지식 파이프라인 | 기존 문서 생성/임베딩 재사용 — 신규 인덱스 경로 없음 | 안전 |
| 배치 | 기존 스케줄러 패턴, env로 off 가능(0=비활성) | 안전 |
| 이슈 전이 | resolved 훅 1개 추가(best-effort) | 안전 |
| 결정 9 준수 | 모든 반영은 사람 승인 후 — 자동승인 경로 없음 | 준수 |

## 3. 테스트/배포
- 단위: 배치 기준(임계·멱등·dismissed 제외), resolved 훅 제안, accept→문서 생성·감사, dismiss.
- 스테이징: SQL 선적용 → 배포 → amoebaorder 이슈 해결 → 제안 생성 → 승인 → KB 문서·임베딩 확인.

## 4. 산출물
PR-P5a(백엔드+SQL) → PR-P5b(콘솔) → 배포 → TCR/RPT → **이슈 워크플로우 로드맵(P1~P5) 완결**.
