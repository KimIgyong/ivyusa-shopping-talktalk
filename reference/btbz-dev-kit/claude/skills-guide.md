# Claude 스킬 작성 가이드 + 검증된 스킬 템플릿

> **버전**: 1.0 (2026-07-30)
> AMA에서 실운영 중인 스킬 2종(pre-deploy-check, branch-protection-check)을 일반화한 템플릿 포함.

---

## 1. 스킬이란

`.claude/skills/{skill-name}/SKILL.md`에 저장되는 **반복 절차의 실행 런북**이다. Claude가 해당 상황을 만나면 스킬을 로드해 검증된 절차대로 수행한다. 메모리가 "사실 기록"이라면 스킬은 "실행 절차"다.

## 2. 어떤 작업을 스킬로 만드는가

AMA 경험 기준, 스킬화 가치가 높은 작업:

1. **여러 세션에서 반복되는 다단계 절차** — 배포 전 마이그레이션 점검, 브랜치 보호 점검.
2. **실수 비용이 큰 절차** — 운영 DB 조작, 프로덕션 배포 검증.
3. **환경 지식이 필요한 절차** — SSH alias, 컨테이너명, DB 계정 등 매번 재조사하면 낭비인 정보.

일회성 작업, 단순 명령 1개짜리는 스킬화하지 않는다 (CLAUDE.md나 메모리로 충분).

## 3. SKILL.md 형식

```markdown
---
name: skill-name
description: 무엇을 하는지 + **언제 사용하는지(트리거 상황)를 구체적으로** — Claude가
  이 설명만 보고 로드 여부를 판단한다. "사용 시점 - (1)..., (2)..., (3)..." 형식 권장.
---

# 제목

배경 1~2문장 (왜 이 절차가 필요한가 — 자동화 갭, 장애 이력).

## 단계별 절차
실행 가능한 명령 블록 + 판단 기준. 위험 명령에는 사전 확인 조건 명시
("사용자 재승인 후", "파일 내용 Read 검토 후" 등).

## 재발 방지 팁 / 관련 메모리 링크
```

**작성 요령 (AMA 검증)**:
- description에 트리거를 열거하면 적중률이 크게 오른다 — "(1) 배포 전 PR에 sql 변경이 있을 때 (2) 500 장애 조사 중 relation does not exist 의심 시 (3) 재배포 직후 회귀 점검".
- 명령은 복사-실행 가능하게 실값(서버 alias, 컨테이너명) 포함.
- **파괴적 명령 앞에는 안전 게이트를 스킬 안에 명시** — 프로덕션 SQL 적용은 "사용자 재승인 후", SQL은 "DROP/TRUNCATE 없음 + 멱등성 확인 후".
- 관련 메모리 파일명을 끝에 링크해 그물을 만든다.

---

## 4. 템플릿 1: pre-deploy-check (배포 전 마이그레이션 점검)

`{...}` 치환 후 `.claude/skills/pre-deploy-check/SKILL.md`로 설치.

````markdown
---
name: pre-deploy-check
description: 스테이징/프로덕션 배포 직전·직후 스키마 마이그레이션 누락 여부를 점검한다.
  사용 시점 - (1) 배포 전 PR 리뷰에서 `sql/*.sql` 또는 마이그레이션 SQL 변경이 있는 경우,
  (2) 502/500 장애 원인 조사 중 "relation does not exist" 에러 의심,
  (3) 스테이징/프로덕션 재배포 직후 회귀 점검. 대상 환경 - `{staging-alias}`, `{production-alias}`.
---

# Pre-Deploy Migration Check

이 프로젝트의 배포 스크립트는 **SQL 마이그레이션을 자동 실행하지 않는다**. 코드가 반영되어도
스키마가 뒤따르지 않으면 `relation "..." does not exist` 500이 발생한다. 이 갭을 검증/보정한다.

## 1. 스키마 의존 변경 탐지
```bash
git log --oneline -20 main -- 'sql/**/*.sql' 'apps/api/src/**/*.entity.ts'
git diff --name-only origin/main...HEAD -- 'sql/**/*.sql' 'apps/api/src/**/*.entity.ts'
```

## 2. 대상 DB에서 테이블 존재 확인
```bash
ssh {env-alias} "docker exec {pg-container} psql -U {db_user} -d {db_name} -c '\dt <table_name>'"
```

## 3. 누락 SQL 적용
**사전에 파일 내용을 반드시 Read로 검토**하고, DROP/TRUNCATE 없음 + 멱등성(`IF NOT EXISTS`)
확인 후 실행. 프로덕션은 배포 전 스키마 스냅샷 권장:
```bash
ssh {production-alias} "TS=\$(date +%Y%m%d-%H%M%S) && docker exec {pg-container} \
  pg_dump -U {db_user} -d {db_name} -t <table> --schema-only > ~/backup-pre-<tag>-\${TS}.sql"
```
적용 (프로덕션은 반드시 사용자 재승인 후):
```bash
ssh {env-alias} "docker cp ~/{project}/sql/<file>.sql {pg-container}:/tmp/m.sql \
  && docker exec {pg-container} psql -U {db_user} -d {db_name} -v ON_ERROR_STOP=1 -f /tmp/m.sql"
```

### 배포 순서 (스키마 변경 동반 시)
1. 마이그레이션 선적용 → 2. deploy-*.sh → 3. 새 요청 1회 후 `--since=1m` 로그에
`relation/column does not exist` 없는지 확인.
(프로덕션 deploy는 `echo y |` stdin 주입 필요)

## 4. 적용 후 회귀 점검
- API 로그 `--since=5m`에서 `relation.*does not exist|ERROR` grep
- 장애 엔드포인트 직접 재호출 200 확인

## 5. 재발 방지
- 스키마 PR 본문 `## Migration` 섹션 강제 (03-git-collaboration-standard.md §3.3)
- 관련 메모리: deploy_migrations.md, feedback_schema_pr_checklist.md
````

---

## 5. 템플릿 2: branch-protection-check (브랜치 보호 점검)

`.claude/skills/branch-protection-check/SKILL.md`로 설치.

````markdown
---
name: branch-protection-check
description: GitHub 브랜치 보호 규칙(main/production) 점검 - gh api로 protected 여부,
  PR 승인 수, Ruleset을 확인하거나 scripts/check-branch-protection.sh로 PASS/FAIL 자동 점검.
  배포 전 점검, 보호 규칙 회귀 확인, "브랜치 보호" 관련 요청 시 사용.
---

# GitHub 브랜치 보호 규칙 점검

운영 기준: `main`, `production` 모두 `protected: true` + `required_approving_review_count >= 1`.

## 자동 점검 (우선 사용)
```bash
bash scripts/check-branch-protection.sh            # 기본 저장소
bash scripts/check-branch-protection.sh <OWNER> <REPO>
```

## 수동 점검 (gh api)
```bash
gh auth status
OWNER={owner}; REPO={repo}
gh api repos/$OWNER/$REPO/branches/main --jq '{name: .name, protected: .protected}'
gh api repos/$OWNER/$REPO/branches/production --jq '{name: .name, protected: .protected}'
# Classic 상세 (승인 수/stale dismiss/enforce_admins)
gh api repos/$OWNER/$REPO/branches/main/protection --jq '{approvals: .required_pull_request_reviews.required_approving_review_count, enforce_admins: .enforce_admins.enabled}'
# Ruleset 기반 (Classic 미사용 시 필수)
gh api repos/$OWNER/$REPO/rules/branches/main
gh api repos/$OWNER/$REPO/rulesets --paginate --jq '.[] | {id, name, target, enforcement}'
```
````

---

## 6. 추가 스킬 후보 (AMA 경험상 가치 있는 것)

- **deploy-verification**: 04 문서 §4의 배포 검증 3종 세트(부팅 로그 → 컨테이너 나이 → 401/404) 절차화
- **incident-triage**: 502/500/401 증상별 진단 트리 (05 문서 §A 기반)
- **release-to-production**: main→production PR 생성 → admin merge → 마이그레이션 → 배포 → 검증 전체 파이프라인
