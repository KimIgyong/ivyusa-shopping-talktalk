-- PLN-260824-Session-Grouping — timeline/project session groups.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: DROP TABLE chat_group_members; DROP TABLE chat_groups;
--
-- A group is a VIEW over its member sessions' conversations. kind is a
-- classifier only (timeline=individual, project=client company) — no
-- behavioral difference. Membership is by SESSION (D1): future conversations
-- of a member session appear in the group automatically.

CREATE TABLE IF NOT EXISTS chat_groups (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NOT NULL,
  kind       VARCHAR(16)  NOT NULL,
  title      VARCHAR(100) NOT NULL,
  created_by BIGINT       NOT NULL,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_cgroup_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_group_members (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT      NOT NULL,
  group_id   BIGINT      NOT NULL,
  session_id BIGINT      NOT NULL,
  added_by   BIGINT      NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cgm_group_session (group_id, session_id),
  KEY idx_cgm_tenant_session (tenant_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
