# SQL Migrations

- `01-schema.sql` — full DDL (MySQL 8, utf8mb4/InnoDB), mirrors `design/chat-widget-schema.sql`
  (CHATWIDGET-ERD-1.0.0). Source of truth for staging/production where TypeORM
  `synchronize` is disabled.

## Dev
`synchronize=true` builds the schema automatically; then run `npm run db:seed`.
Seed inserts real bcrypt hashes (the DDL's `<BCRYPT(...)>` placeholders are illustrative).

## Staging / Production
Run `01-schema.sql` manually, then feature migrations `migration_{feature}.sql` in order.
Seed admin/master via a controlled script (never commit production hashes).
