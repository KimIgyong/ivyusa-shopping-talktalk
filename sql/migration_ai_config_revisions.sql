-- PLN-260804 W4-D — 테넌트 AI 설정(페르소나·응답규칙) 개정 이력 (FR-073)
--
-- 코드 배포 **전에** 적용한다. staging/production은 DB_SYNCHRONIZE=false.
--
--   mysql -u<user> -p<pass> <db> < sql/migration_ai_config_revisions.sql
--
-- 재실행 안전.

CREATE TABLE IF NOT EXISTS tenant_ai_config_revisions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT NOT NULL,
  -- 테넌트별 순번. max+1로 채번한다(count+1 금지 — 코드 컨벤션 §2).
  revision_no        INT NOT NULL,
  persona            TEXT NULL,
  rules              JSON NULL,
  scenario_overrides JSON NULL,
  kind               VARCHAR(16) NOT NULL,
  changed_fields     JSON NULL,
  -- 왜 바꿨는지. 수동 저장은 사람이 적고, 코칭 경유는 제안의 rationale이 들어온다.
  note               VARCHAR(500) NULL,
  proposal_id        BIGINT NULL,
  actor_user_id      BIGINT NULL,
  created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_cfgrev_tenant (tenant_id, revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
