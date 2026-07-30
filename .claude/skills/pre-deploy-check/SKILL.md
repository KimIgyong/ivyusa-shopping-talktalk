---
name: pre-deploy-check
description: Check for missing schema migrations right before/after a staging or production
  deploy of IVY TalkTalk. Use when - (1) a PR being deployed touches `sql/*.sql` or
  `apps/api/src/**/*.entity.ts`, (2) investigating 500/502 where "Table ... doesn't exist" /
  "Unknown column" is suspected, (3) regression check right after a redeploy. Target -
  staging `shoptalk.amoeba.site` (host 211.110.140.172, creds in `secrets/staging-server.md`,
  MySQL container `ivy_mysql_staging`); production TBD.
---

# Pre-Deploy Migration Check (IVY TalkTalk)

Adapted from `reference/btbz-dev-kit/claude/skills-guide.md` template 1 for this
project's MySQL stack. The deploy script (`docker/staging/deploy-staging.sh`) does
**NOT** run SQL migrations. ⚠️ Current caveat: staging still runs `DB_SYNCHRONIZE=true`
(SPEC §14 open item), so TypeORM auto-creates schema there — but production is
`synchronize=false`, and staging is planned to flip. Follow this runbook whenever a
deploy carries schema changes.

## 1. Detect schema-affecting changes
```bash
git diff --name-only origin/main...HEAD -- 'sql/**/*.sql' 'apps/api/src/**/*.entity.ts'
git log --oneline -20 main -- 'sql/*.sql' 'apps/api/src/**/*.entity.ts'
```

## 2. Check the target DB
Server SSH details: `secrets/staging-server.md` (gitignored — never commit).
```bash
ssh <staging> "docker exec ivy_mysql_staging mysql -u ivy -p\"\$DB_PASSWORD\" db_ivy_talktalk \
  -e 'SHOW TABLES LIKE \"<table>\"; SHOW COLUMNS FROM <table>;'"
```

## 3. Apply missing SQL
**Read the SQL file first** — confirm no DROP/TRUNCATE and idempotency
(`CREATE TABLE IF NOT EXISTS`, guarded `ALTER`). Production applies only after
explicit user re-approval, with a schema snapshot first:
```bash
ssh <env> "docker exec ivy_mysql_staging sh -c 'mysqldump -u ivy -p\"\$MYSQL_PASSWORD\" \
  --no-data db_ivy_talktalk <table>' > ~/backup-pre-<tag>-$(date +%Y%m%d-%H%M%S).sql"
ssh <env> "docker cp ~/<repo>/sql/<file>.sql ivy_mysql_staging:/tmp/m.sql && \
  docker exec ivy_mysql_staging sh -c 'mysql -u ivy -p\"\$MYSQL_PASSWORD\" db_ivy_talktalk < /tmp/m.sql'"
```
⚠️ Heredoc/stdin over `ssh + docker exec` without `-i` silently does nothing
(kit lesson B-4) — use `docker cp` + `-e`/file execution as above, then verify
affected-row counts.

## 4. Deploy order (when schema changes ride along)
1. Apply SQL (above) → 2. `ssh <staging> "cd ~/<repo> && bash docker/staging/deploy-staging.sh"`
(never run the script locally) → 3. verify.

## 5. Post-deploy verification (never trust exit code — kit 04 §4)
```bash
ssh <staging> "docker logs ivy_api_staging --tail 60 2>&1 | grep -iE 'successfully started|error'"
ssh <staging> "docker ps --format 'table {{.Names}}\t{{.Status}}'"   # container age = rebuilt?
curl -s -o /dev/null -w '%{http_code}' https://shoptalk.amoeba.site/api/v1/<new-route>
# 401 = deployed (auth only) / 404 = NOT deployed / 502 = API down (check Restarting)
ssh <staging> "docker logs ivy_api_staging --since=5m 2>&1 | grep -iE \"doesn't exist|Unknown column\""
```

## 6. Related
- Schema PRs need a `## Migration` body section — `reference/btbz-dev-kit/03-git-collaboration-standard.md` §3.3
- Runbook source: `reference/btbz-dev-kit/04-deployment-operations.md` §3–4
- Memory: `staging-server.md`, `deployment-strategy.md`, `btbz-dev-kit.md`
