-- PLN-260829 Smart Knowledge Board B3: 코멘트+멘션 (P5-1)
-- 적용 순서: DB 선적용 후 코드 배포. 멱등. 롤백 = DROP TABLE board_comments.

CREATE TABLE IF NOT EXISTS board_comments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  body TEXT NOT NULL,
  mentions JSON NULL,
  author_user_id BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_board_comments_doc (tenant_id, document_id),
  KEY idx_board_comments_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
