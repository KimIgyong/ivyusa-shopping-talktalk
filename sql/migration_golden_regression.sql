-- PLN-260813 — 코칭 W4-A/B: 골든 질문 회귀 검증 (FR-073)
--
-- 코드 배포 **전에** 적용한다. 스테이징/프로덕션은 DB_SYNCHRONIZE=false라
-- 테이블이 자동 생성되지 않으며, 없으면 /ai-coach/golden/* 이 전부 500이다.
--
--   mysql -u<user> -p<pass> <db> < sql/migration_golden_regression.sql
--
-- 재실행 안전.

CREATE TABLE IF NOT EXISTS golden_questions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT NOT NULL,
  question    TEXT NOT NULL,
  language    VARCHAR(8) NOT NULL DEFAULT 'KO',
  note        VARCHAR(300) NULL,
  active      TINYINT NOT NULL DEFAULT 1,
  created_by  BIGINT NULL,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_golden_q_tenant (tenant_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS golden_runs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT NOT NULL,
  kind           VARCHAR(16) NOT NULL,
  label          VARCHAR(120) NULL,
  proposal_id    BIGINT NULL,
  -- persona+rules+scenario_overrides 해시. 두 실행이 같은 해시면 그 차이는
  -- 설정 효과가 아니라 모델 자체의 변동이다.
  config_hash    VARCHAR(64) NOT NULL,
  question_count INT NOT NULL DEFAULT 0,
  truncated      TINYINT NOT NULL DEFAULT 0,
  status         VARCHAR(16) NOT NULL DEFAULT 'running',
  created_by     BIGINT NULL,
  created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at   DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_golden_run_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS golden_run_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT NOT NULL,
  run_id      BIGINT NOT NULL,
  -- 질문을 지워도 과거 실행 기록은 남아야 하므로 nullable.
  question_id BIGINT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  confidence  DECIMAL(4,3) NULL,
  blocked     TINYINT NOT NULL DEFAULT 0,
  citations   JSON NULL,
  error       VARCHAR(300) NULL,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_golden_item_run (run_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
