-- 260808-issues-p1.sql — PLN-260808-Issue-Workflow-P1 (이슈 코어).
-- Conversation 1:1 승격 티켓(issues) + 타임라인(issue_events) + 3-모드 엔타이틀먼트.
-- Idempotence: guard with `SHOW TABLES LIKE 'issues'` / `SHOW COLUMNS FROM tenants LIKE 'workflow_mode'`.

-- 3-mode entitlement (REQ-260807 §11.1): server-side judgement. Default 'base'
-- keeps every existing tenant's behavior unchanged; set 'native' per pilot by SQL.
ALTER TABLE `tenants`
  ADD COLUMN `workflow_mode` VARCHAR(8) NOT NULL DEFAULT 'base' AFTER `widget_copy`;

CREATE TABLE `issues` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `issue_no` INT NOT NULL,
  `conversation_id` BIGINT NOT NULL,
  `session_id` BIGINT NOT NULL,
  `customer_id` BIGINT NULL,
  `type` VARCHAR(24) NOT NULL DEFAULT 'other',
  `status` VARCHAR(16) NOT NULL DEFAULT 'received',
  `resolved_tier` VARCHAR(12) NULL,
  `priority` VARCHAR(8) NOT NULL DEFAULT 'normal',
  `assignee_user_id` BIGINT NULL,
  `assignee_label` VARCHAR(24) NULL,
  `reject_reason` VARCHAR(24) NULL,
  `resolution_note` VARCHAR(500) NULL,
  `reopen_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` DATETIME NULL,
  `closed_at` DATETIME NULL,
  UNIQUE KEY `uk_issue_no` (`tenant_id`, `issue_no`),
  UNIQUE KEY `uk_issue_conv` (`conversation_id`),
  INDEX `idx_issue_tenant_status` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `issue_events` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `issue_id` BIGINT NOT NULL,
  `actor_type` VARCHAR(8) NOT NULL,
  `actor_id` BIGINT NULL,
  `type` VARCHAR(16) NOT NULL,
  `from_status` VARCHAR(16) NULL,
  `to_status` VARCHAR(16) NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ievt_issue` (`issue_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
