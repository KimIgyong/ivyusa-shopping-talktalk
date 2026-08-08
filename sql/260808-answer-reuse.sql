-- 260808-answer-reuse.sql — PLN-260808-Widget-Greetings-EndChat-AnswerReuse (Track C).
-- Reusable Q&A pairs: a repeat/similar question is answered from a past verified
-- answer (agent reply, or high-confidence cited AI reply) BEFORE calling the LLM.
-- Question embeddings live in Qdrant collection `reuse_questions` (point id = row id);
-- MySQL is the source of truth and the collection is rebuildable.
-- Idempotence: guard with `SHOW TABLES LIKE 'answer_reuse'`.

CREATE TABLE `answer_reuse` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL,
  `lang` VARCHAR(5) NOT NULL,
  `question_text` VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL, -- PII-scrubbed
  `answer_text` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,           -- console-editable (D-C3)
  `source` VARCHAR(8) NOT NULL,                                     -- agent | ai
  `source_message_id` BIGINT NULL,
  `confidence` DECIMAL(4,3) NULL,                                   -- ai source only
  `citations` JSON NULL,
  `active` TINYINT NOT NULL DEFAULT 1,
  `hit_count` INT NOT NULL DEFAULT 0,
  `last_hit_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_reuse_tenant` (`tenant_id`, `active`),
  INDEX `idx_reuse_src_msg` (`source_message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
