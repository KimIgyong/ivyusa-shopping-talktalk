-- PLN-260815-Knowledge-Gdrive-Adapter G1 — room for a service-account key.
--
-- secret_enc was VARBINARY(2048). A Google service-account key does not fit:
-- the full JSON is ~2,379 B and AES-GCM adds 28 B (iv + tag), so ~2,407 B.
-- Even storing only client_email + private_key lands at ~1,891 B, leaving 157 B
-- of headroom — one RSA-4096 key would blow past it.
--
-- Widening only. Existing rows (shopify 204 B, cafe24 236 B) are untouched, and
-- no backfill is needed.
--
-- Rollback: shrinking back to 2048 truncates data, so delete the google_drive
-- row first:
--   DELETE FROM integration_credentials WHERE provider = 'google_drive';
--   ALTER TABLE integration_credentials MODIFY COLUMN secret_enc VARBINARY(2048) NULL;

SET @sz := (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'integration_credentials'
              AND COLUMN_NAME = 'secret_enc');
SET @sql := IF(@sz IS NOT NULL AND @sz < 4096, '
  ALTER TABLE integration_credentials MODIFY COLUMN secret_enc VARBINARY(4096) NULL
', 'SELECT "integration_credentials.secret_enc already 4096 or wider"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
