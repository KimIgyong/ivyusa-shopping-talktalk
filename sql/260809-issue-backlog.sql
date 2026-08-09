-- 260809-issue-backlog.sql — PLN-260809-Issue-Workflow-Backlog (B1: Gorgias L3 릴레이).
-- 인바운드(상담원 답변) 릴레이 멱등 커서 — 이미 위젯에 릴레이한 Gorgias 메시지 id.
-- Idempotence: guard with `SHOW COLUMNS FROM external_tickets LIKE 'last_inbound_message_id'`.

ALTER TABLE `external_tickets`
  ADD COLUMN `last_inbound_message_id` BIGINT NULL AFTER `last_relayed_message_id`;
