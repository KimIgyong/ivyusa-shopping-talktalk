-- PLN-260812-Session-Alias-Issue-Preview — operator-set display name per session.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: ALTER TABLE sessions DROP COLUMN alias;

ALTER TABLE sessions ADD COLUMN alias VARCHAR(60) NULL AFTER identity_level;
