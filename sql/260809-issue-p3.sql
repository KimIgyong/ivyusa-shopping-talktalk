-- 260809-issue-p3.sql — PLN-260809-Issue-Workflow-P3 (Gorgias L2 상태 추적).
-- ticket-updated 웹훅이 외부 티켓의 open/closed를 기록 — closed 후 재-에스컬레이션은
-- append 대신 신규 티켓(결정 12 완성).
-- Idempotence: guard with `SHOW COLUMNS FROM external_tickets LIKE 'status'`.

ALTER TABLE `external_tickets`
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'open' AFTER `external_id`;
