-- 260809-issue-p5.sql — PLN-260809-Issue-Workflow-P5 (지식 폐루프).
-- 지식갭 제안 태스크: 배치(에스컬레이션 다발/근거문서 없음) + 상담원 해결답변 캡처 후보.
-- 결정 9: 자동제안까지만 — 반영은 콘솔에서 사람이 승인(accept→기존 KB 파이프라인).
-- Idempotence: guard with `SHOW TABLES LIKE 'knowledge_gap_tasks'`.

CREATE TABLE `knowledge_gap_tasks` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `source` VARCHAR(24) NOT NULL,
  `ref_key` VARCHAR(64) NOT NULL,
  `title` VARCHAR(300) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detail` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `metric_json` JSON NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'proposed',
  `decided_by` BIGINT NULL,
  `decided_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_gap` (`tenant_id`, `source`, `ref_key`),
  INDEX `idx_gap_tenant_status` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
