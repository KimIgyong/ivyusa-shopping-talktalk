-- PLN-260829 Smart Knowledge Board B1: 보드 코어 4테이블 + 기존 테넌트 백필
-- + 죽은 kb_board_posts 드랍(B1-10 — 코드 경로 0·스테이징 0행 확인).
-- 적용 순서: DB 선적용 후 코드 배포. 멱등.

CREATE TABLE IF NOT EXISTS boards (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL DEFAULT 'Smart Knowledge Board',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_boards_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_documents (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  doc_group VARCHAR(16) NOT NULL DEFAULT 'counsel',
  category1 VARCHAR(64) NOT NULL,
  category2 VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  team_label VARCHAR(32) NULL,
  content LONGTEXT NULL,
  tags JSON NULL,
  links JSON NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  author_user_id BIGINT NOT NULL,
  updated_by BIGINT NULL,
  promoted_document_id BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_board_docs_tenant (tenant_id, board_id, doc_group),
  FULLTEXT KEY ft_board_docs_title_content (title, content) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_document_revisions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  revision_no INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NULL,
  category1 VARCHAR(64) NULL,
  category2 VARCHAR(64) NULL,
  changed_fields JSON NULL,
  change_kind VARCHAR(16) NOT NULL DEFAULT 'update',
  actor_user_id BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_board_rev (document_id, revision_no),
  KEY idx_board_rev_tenant (tenant_id, document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_attachments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL,
  tenant_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  kind VARCHAR(8) NOT NULL DEFAULT 'file',
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(128) NULL,
  storage_path VARCHAR(512) NULL,
  size BIGINT NULL,
  url VARCHAR(1024) NULL,
  created_by BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_board_att_uuid (uuid),
  KEY idx_board_att_doc (tenant_id, document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기존 테넌트 백필: 테넌트당 기본 보드 1행 (lazy ensure의 레이스 없는 선행 채움)
INSERT INTO boards (tenant_id, name)
SELECT t.id, 'Smart Knowledge Board' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM boards b WHERE b.tenant_id = t.id);

-- B1-10: 작성 화면이 존재한 적 없는 구 board 파이프의 잔해 (REQ-260829 C1)
DROP TABLE IF EXISTS kb_board_posts;
