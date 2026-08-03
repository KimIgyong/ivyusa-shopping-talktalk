# 배포·운영 표준 v2.0

> **버전**: 2.0 (2026-07-30) — DEPLOYMENT-GUIDE(2026-04-11) 업그레이드
> **핵심 추가**: 배포 검증 절차(§4), 수동 마이그레이션 런북(§3), Docker 운영 함정(§5) — 전부 AMA 실장애 기반

---

## 1. 환경 구성

| 환경 | 브랜치 | 배포 스크립트 | 실행 위치 |
|------|--------|--------------|----------|
| 개발 | (자유) | `bash docker/dev/deploy-dev.sh` | 로컬 (DB만 Docker, 서버는 npm run dev) |
| 스테이징 | `main` | `bash docker/staging/deploy-staging.sh` | **스테이징 서버** |
| 프로덕션 | `production` | `bash docker/production/deploy-production.sh` | **프로덕션 서버** |

```bash
# 원격 실행 표준형
ssh {staging-alias} "cd ~/{project} && bash docker/staging/deploy-staging.sh"
ssh {production-alias} "cd ~/{project} && echo y | bash docker/production/deploy-production.sh"
```

- ⚠️ **로컬에서 스테이징/프로덕션 스크립트 실행 금지** — 로컬 Docker에 잘못 배포된다.
- ⚠️ **프로덕션 스크립트는 `read -rp [y/N]` 확인 프롬프트 포함** — SSH non-interactive에서는 `echo y |` stdin 주입 필요(없으면 무한 대기).
- ⚠️ **`deploy-production.sh`는 `production` 브랜치를 checkout/pull하여 빌드한다.** 로컬에서 `git checkout main`을 해도 무시됨. main에만 머지된 코드는 프로덕션에 절대 반영되지 않는다 → **main→production PR 먼저**.

## 2. 배포 스크립트 필수 규칙

1. **`docker compose build` 직접 실행 금지** — 반드시 deploy-*.sh 경유. `--env-file` 누락 시 `VITE_*` 변수가 잘못된 값으로 **빌드 시점 인라인**되어 프론트엔드에 영구 포함된다.
2. 스크립트 표준 단계: `git pull` → 이미지 백업 태그(롤백용) → build → down/up → health check → prune.
3. 신규 프로젝트 스크립트 작성 시 반영할 개선(AMA 미해결 교훈):
   - 헬스체크 타임아웃 창을 넉넉히 (시드/부팅이 길면 false-negative exit 1 — §4-1)
   - `git pull` 실패 시 **명시적으로 exit 1** (AMA는 pull abort 후에도 exit 0으로 끝나 옛 코드 배포됨)
   - pending SQL 마이그레이션 자동 적용 단계 검토 (§3의 수동 절차를 자동화)
   - 빌드 캐시 상한 관리 (`docker builder prune --keep-storage`) — 단 실효 검증 필수 (AMA에서 135GB까지 누적된 사례)

---

## 3. DB 마이그레이션 런북 (수동 적용) — MUST

운영 환경은 `synchronize: false`. **배포 스크립트는 SQL을 자동 실행하지 않는다.** 스키마 변경 배포는 아래 절차를 따른다. (Claude 스킬 `pre-deploy-check`로 자동 점검 — claude/skills-guide.md)

### 3.1 환경 매핑표 (프로젝트 초기에 확정해 CLAUDE.md에 기록)

| 환경 | SSH | DB 컨테이너 | DB 접속 |
|------|-----|------------|---------|
| staging | `ssh {staging-alias}` | `{prj}-postgres-staging` | `psql -U {db_user} -d {db_name}` |
| production | `ssh {production-alias}` | `{prj}-postgres-production` | 동일 |

⚠️ 컨테이너가 2개 이상 떠 있을 수 있다(AMA 프로덕션에 postgres 컨테이너 2개 존재) — 실제 서비스가 연결된 컨테이너를 compose 파일로 확인.

### 3.2 절차

```bash
# 0) (프로덕션) 대상 테이블 스키마 스냅샷
ssh {prod} "TS=\$(date +%Y%m%d-%H%M%S) && docker exec {pg} pg_dump -U {u} -d {db} \
  -t <table> --schema-only > ~/backup-pre-<tag>-\${TS}.sql"

# 1) 마이그레이션 SQL 적용 (배포 전 선적용이 원칙)
ssh {env} "docker cp ~/{project}/sql/<file>.sql {pg}:/tmp/m.sql \
  && docker exec {pg} psql -U {u} -d {db} -v ON_ERROR_STOP=1 -f /tmp/m.sql"

# 2) 존재 확인
ssh {env} "docker exec {pg} psql -U {u} -d {db} -c '\dt <table>'"

# 3) 코드 배포 (deploy-*.sh)

# 4) 회귀 점검 — 새 요청 후 최근 로그에 relation/column does not exist 없는지
ssh {env} "docker logs {api} --since=1m 2>&1 | grep -iE 'relation.*does not exist|column.*does not exist'"
```

- **순서 원칙: 마이그레이션 선적용 → 코드 배포.** (구 코드는 새 컬럼을 모름 → 안전. 반대로 새 코드+구 스키마 = 500.) 후적용하면 배포~적용 사이 수초간 에러 window가 생긴다.
- SQL은 적용 전 반드시 내용 Read 검토: DROP/TRUNCATE 없음 + 멱등성(`IF NOT EXISTS`) 확인.
- ⚠️ **heredoc 함정**: `ssh ... "docker exec {pg} psql <<'SQL'"`은 `docker exec -i`가 없으면 stdin 미전달로 **조용히 무실행**(UPDATE 0). 다중문은 `-i` 사용 또는 `-c "단일 CTE"`로.
- ⚠️ 마이그레이션 적용 후 **스테이징은 API 재시작이 필요할 수 있음**(TypeORM 메타데이터 캐시). 선적용 순서를 지키면 불필요.

---

## 4. 배포 검증 절차 — MUST (exit 0을 믿지 말 것)

deploy exit code, "성공" 메시지, 부팅 로그만으로 배포 성공을 판단하지 않는다. AMA에서 **exit 0인데 미배포 / exit 1인데 정상**인 사례가 모두 실재했다.

### 4.1 부팅 확인 (exit 1 ≠ 실패)

시드/부팅이 길면 헬스체크 타임아웃으로 exit 1이 나지만 실제로는 정상인 경우가 잦다. 판단 기준은 로그:

```bash
ssh {env} "docker logs {api} --tail 60 2>&1 | grep -iE 'successfully started|running on port|UnknownDependencies|can.t resolve'"
curl -s -o /dev/null -w '%{http_code}' https://{web-domain}   # 200 확인
```

### 4.2 실반영 확인 (exit 0 ≠ 성공)

```bash
# a) 컨테이너 나이 — STATUS가 "Up N분"으로 옛값이면 재빌드 안 된 것
ssh {env} "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# b) 신규 라우트 런타임 검증 (가장 확실)
curl -s -o /dev/null -w '%{http_code}' https://{api-domain}/api/v1/<new-route>
# → 401 = 배포됨(인증만 없음) / 404 = 미배포(라우트 자체가 없음)

# c) 번들 grep (보조 수단 — minify로 0이 나올 수 있어 신뢰도 낮음)
docker exec {api} sh -lc "grep -c '<고유문자열>' /app/apps/api/dist/main.js"      # API
docker exec {web} sh -c "grep -rl '<문자열>' /usr/share/nginx/html/assets | head"  # Web
```

- grep 문자열은 **기능 고유 문자열**로 (일반 단어는 기존 기능과 충돌해 오탐).
- 상태 판별 조견: **502 = API 죽음(무한 재시작 의심 → `docker ps` Restarting 확인)** / 404 = 라우트 없음(미배포) / 401 = 정상 서빙.

### 4.3 스키마 동반 배포 회귀 점검

§3.2의 4) + 장애 의심 엔드포인트 직접 재호출 200 확인.

---

## 5. Docker 운영 함정 (AMA 실장애)

1. ⚠️ **캐시 prune 후 네이티브 모듈 빌드 실패**: `docker builder prune -af` 후 fresh 빌드에서 bcrypt가 prebuilt 다운로드에 실패하면 소스 컴파일 → `Could not find any Python` 실패. **모든 Dockerfile deps 스테이지(alpine)에 `RUN apk add --no-cache python3 make g++` 포함**(처음부터). 캐시 덕에 숨어 있다가 prune 후에 터지는 유형.
2. ⚠️ **빌드 캐시 디스크 고갈(ENOSPC)**: 빌드 캐시가 무한 누적되어 `/var` 100% → `npm ci` ENOSPC. 3회 재발(135GB+ 누적). 배포 실패 시 디스크부터 확인: `df -h` + `docker system df` → `docker builder prune -af`(수 분 소요) + `docker image prune -f`(dangling만 — 활성 이미지 보존).
3. ⚠️ **프로덕션에서 builder prune은 신중히** — scratch 재빌드 각오(1번 함정과 결합).
4. **npm ci 일시 오류(ECONNRESET)**: builder prune + 재시도로 해소되는 경우가 많음.
5. Dockerfile은 스테이징/프로덕션 공유(`docker/staging/Dockerfile.*`) — 수정 시 양 환경 영향 인지.

---

## 6. 운영 인프라 체크리스트

- [ ] SSL 인증서 만료 모니터링 (AMA에서 스테이징 도메인 SSL이 -106일 만료 상태로 방치된 사례)
- [ ] 서버 헬스체크 모니터링 + 메일 알림 (AMA 13종 10분 주기 + 상호감시 패턴 참조)
- [ ] fail2ban 운영 시 ⚠️ **Docker 게이트웨이 IP(172.x.0.1)를 AllowedIp 등록** — 컨테이너 경유 트래픽이 포트스캔으로 오인되어 무기한 차단, 전 경로 502 유발(AMA Stalwart 인시던트). 차단 해소는 destroy + allowlist + 컨테이너 재시작까지.
- [ ] DB 백업 주기 + 마이그레이션 전 스냅샷 습관화(§3.2)
- [ ] 방화벽/Security Group에 서비스 포트 반영 (포트 변경 시 잊기 쉬움)

## 7. 배포 전 체크리스트 (요약)

- [ ] 올바른 브랜치 (스테이징=main, 프로덕션=production / main→production PR 완료)
- [ ] 로컬 `npm run build` 통과 + **엔티티/DI/모듈 변경 시 로컬 API 실부팅 확인**
- [ ] 스키마 변경 시: SQL 멱등성 검토 → 마이그레이션 **선적용** (§3)
- [ ] 서버 env 파일 존재 + URL 변수 환경 일치 확인
- [ ] 배포 후 §4 검증 (부팅 로그 → 컨테이너 나이 → 401/404 라우트 검증 → 회귀 로그)
