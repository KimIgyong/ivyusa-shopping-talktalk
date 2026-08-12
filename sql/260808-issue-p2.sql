-- 260808-issue-p2.sql — PLN-260808-Issue-Workflow-P2 (Gorgias L1 커넥터 참조 테이블).
-- bridge 모드 테넌트의 대화 ↔ 외부 헬프데스크 티켓 매핑 + append 멱등 커서.
-- Idempotence: guard with `SHOW TABLES LIKE 'external_tickets'`.

CREATE TABLE `external_tickets` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `conversation_id` BIGINT NOT NULL,
  `provider` VARCHAR(16) NOT NULL,
  `external_id` VARCHAR(64) NOT NULL,
  `last_relayed_message_id` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_ext_conv` (`conversation_id`, `provider`),
  INDEX `idx_ext_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
