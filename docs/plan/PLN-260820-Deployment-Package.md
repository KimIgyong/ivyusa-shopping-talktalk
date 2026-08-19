# PLN-260820-Deployment-Package

고객사 인프라 전용 배포 패키지(FR-D1 패키지 · FR-D2 업그레이드 경로 · FR-D5 백업·복구) 구현 계획.

- 작성일: 2026-08-20
- 근거 요구: `docs/analysis/REQ-260819-Widget-Theming-Embed-SDK.md` §3.3, §7(C안 혼합 — 결정됨)
- 기준 코드: `origin/main` `636fb7b`
- **UI 변경 없음** → 와이어프레임 없음(콘솔 화면을 만들지 않는다)
- **스키마 변경 없음**

---

## 0. 조사 결과 — production 스택이 낡았다

계획을 세우기 전에 `docker/production/`을 실제로 대조했다. 이 상태로 고객사 AWS에 올리면
**첫 배포는 되고 두 번째 배포에서 데이터가 사라진다.**

| 발견 | 실제 상태 | 결과 |
|---|---|---|
| **업로드 볼륨 없음** | staging에는 `ivy_uploads_staging`, production compose에는 **없음** | 첨부(PR #287)와 로고(PR #323)가 **재배포마다 전멸**. RPT-260814가 경고한 그 실패 |
| **위젯 서비스 없음** | staging엔 `widget`·`pwa`, production엔 `api`·`web`만. `Dockerfile.widget`도 없음 | `talk.ivyusa.com`을 **서빙할 수단이 없다** |
| **nginx가 위젯을 모른다** | `location /api/` + `location /`뿐 | 동상 |
| **env 템플릿이 59개 변수를 누락** | 코드가 읽는 87개 중 템플릿에 28개만 존재 | `UPLOAD_DIR`·`FILE_URL_SECRET`·`CORS_ORIGINS`·`VAPID_*`·`QDRANT_URL`·messenger·Cafe24·Shopify 전부 없음 |
| **마이그레이션 순서 없음** | `deploy-production.sh`는 `up -d --build`만 | 새 코드 + 옛 스키마 = 500 |
| **백업 절차 없음** | 문서 없음 | DB 백업에 **업로드 볼륨이 포함되지 않는다**(RPT-260814 R-4) |

> `UPLOAD_DIR`이 템플릿에 없으면 API는 기본값 `./.uploads`(컨테이너 내부)를 쓴다. 볼륨이 아니므로
> 조용히 동작하다가 다음 배포에서 전부 사라진다 — **에러가 나지 않는 종류의 실패**다.

---

## 1. 범위

| 포함 | 제외 |
|---|---|
| 전용 배포용 compose·Dockerfile·nginx·env 템플릿 | 쿠버네티스·테라폼 |
| 시크릿 생성 스크립트 | 고객사 클라우드 프로비저닝(계정·VPC·DNS) |
| 배포·업그레이드 런북(SQL 선적용 포함) | CI에서 이미지 레지스트리 발행(다음 단계) |
| 백업·복구 절차 + 검증 스크립트 | 자동 백업 스케줄러(고객사 운영 도구에 위임) |
| 배포 후 검증 스크립트 | 모니터링·알림 스택 |

---

## 2. 설계

### 2.1 "production"이 아니라 "self-hosted"다

현재 `docker/production/`은 **아메바가 운영할 프로덕션**을 가정하고 만들어졌다. 이번 산출물은
**고객사가 자기 클라우드에서 돌리는 스택**이라 대상이 다르다. 그래서 새 디렉터리
`docker/self-hosted/`를 만들고, 낡은 `docker/production/`은 **삭제하지 않고 유지**한다 —
아메바 운영 KR 리전 SaaS(Cafe24 몰용)가 그 자리를 쓸 것이기 때문이다.

### 2.2 한 스택에 위젯까지 넣는다

```
                    ┌───────────── 고객사 클라우드 ─────────────┐
  www.ivyusa.com ──▶│  (고객사 TLS 종단: ALB / nginx / Caddy)   │
  talk.ivyusa.com ─▶│            │                              │
                    │         nginx :8080                       │
                    │        ├─ /api/     → api:3000            │
                    │        ├─ /widget/  → widget:80  ★신규    │
                    │        └─ /         → web:80              │
                    │  api ─ mysql · redis · rabbitmq · qdrant   │
                    │  volumes: uploads ★ · mysql · redis ·      │
                    │           rabbitmq · qdrant               │
                    └───────────────────────────────────────────┘
```

`widget-config.js`(PLN-260819 S3)가 있어서 **위젯 번들은 한 번만 빌드**하면 되고, 배포마다
API 주소만 파일로 주입한다. 이 패키지가 그 파일을 생성한다.

### 2.3 env 템플릿은 코드에서 생성한다

87개를 손으로 옮겨 적으면 다음 기능이 추가될 때 또 어긋난다. `scripts/env-inventory.mjs`가
`apps/api/src`를 훑어 코드가 읽는 키를 뽑고, **템플릿에 없는 키를 실패로 보고**한다. CI에
얹으면 "새 env를 추가했는데 템플릿에 안 넣은" 상태가 머지되지 않는다.

템플릿은 세 구획으로 나눈다:

| 구획 | 내용 | 비어 있으면 |
|---|---|---|
| **필수** | DB·JWT·CRED_ENC_KEY·UPLOAD_DIR·PUBLIC_BASE_URL·CORS_ORIGINS | **부팅 거부**(JWT/CRED은 이미 `assert-secrets`가 거부) |
| **기능별** | Shopify·Cafe24·메신저·Voyage·SMTP·VAPID | 그 기능만 꺼짐 |
| **튜닝** | 폴링 주기·리텐션·워커 수 | 기본값 사용 |

### 2.4 시크릿은 생성해 준다

`scripts/gen-secrets.sh`가 `openssl rand`로 JWT 2종·`CRED_ENC_KEY`·`FILE_URL_SECRET`·
DB 비밀번호를 만들어 붙여넣을 형태로 출력한다. `assert-secrets`의 placeholder 정규식
(`change_me|example|dev_|…`)에 걸리지 않는 값을 만드는 것이 목적이다.

⚠️ **`CRED_ENC_KEY`를 바꾸면 저장된 자격증명·PII가 복호화되지 않고, `FILE_URL_SECRET`을 바꾸면
기존 첨부 링크가 전부 무효**가 된다. 런북에 경고로 넣는다.

### 2.5 업그레이드는 SQL이 먼저다

`scripts/deploy-self-hosted.sh`가 순서를 강제한다:

```
1. 버전 태그 확인          git describe / 커밋 SHA 기록
2. sql/ 미적용 마이그레이션 검출 → 목록 출력 후 확인 요구
3. (사람이) SQL 적용
4. 이미지 빌드 · 컨테이너 재생성
5. 검증: 부팅 로그 + 컨테이너 나이 + 라우트 상태코드
```

2단계는 `information_schema` 대조로 판정한다 — 각 `sql/*.sql`이 만드는 컬럼/인덱스가 실제
DB에 있는지 확인해 **"적용해야 할 것이 남았는지"** 를 사람에게 보여준다. 스크립트가 SQL을
직접 실행하지는 않는다(kit 04: 배포 스크립트는 SQL을 자동 실행하지 않는다).

### 2.6 백업은 두 개다

DB만 받고 끝내면 **대화는 남고 사진은 사라진다.**

```
scripts/backup-self-hosted.sh   → mysqldump + uploads 볼륨 tar
scripts/restore-self-hosted.sh  → 둘 다 복원 + 정합성 확인
```

정합성 확인은 실제로 의미 있는 것 하나로 한다: **`message_attachments` 행 수 대비 볼륨에
실재하는 파일 수**. 숫자가 어긋나면 반쪽 복원이다.

---

## 3. 단계 계획 (WBS)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **W1** | env 인벤토리 스크립트 + 3구획 템플릿 | 누락 0으로 통과, CI에서 실패 재현 |
| **W2** | `docker/self-hosted/` compose·Dockerfile.widget·nginx(위젯 라우팅)·**uploads 볼륨** | 로컬에서 스택 기동 → `/api/v1/health` ok · `/widget/` 200 |
| **W3** | `gen-secrets.sh` · `deploy-self-hosted.sh`(마이그레이션 검출·검증) | 미적용 SQL이 있는 DB에서 목록이 정확히 출력됨 |
| **W4** | `backup-*`/`restore-*` + 첨부 정합성 확인 | 백업→볼륨 삭제→복원 후 첨부 바이트 동일 |
| **W5** | 설치 런북 문서(고객사 인프라 담당자용) | 처음 보는 사람이 순서대로 따라갈 수 있는가 |
| **W6** | 스테이징에서 리허설 | §5 |

---

## 4. 부수영향 분석

| # | 영역 | 영향 | 대응 |
|---|---|---|---|
| 1 | 기존 staging 배포 | 손대지 않는다 | `docker/staging/`는 그대로 |
| 2 | 기존 `docker/production/` | 아메바 운영 SaaS 자리로 남긴다 | 삭제하지 않음. README로 용도 구분 명시 |
| 3 | env 인벤토리 CI 게이트 | **기존 코드에서 누락 59건이 즉시 실패로 잡힌다** | 템플릿을 먼저 채우고 게이트를 켠다 |
| 4 | 위젯 이미지 | self-hosted에 새로 추가 | staging Dockerfile.widget 재사용 |
| 5 | `widget-config.js` | 배포별 API 주소 주입 | 스크립트가 생성, 볼륨 마운트 |
| 6 | 백업 스크립트 | mysqldump는 락을 잡는다 | `--single-transaction` 사용, 런북에 명시 |
| 7 | 문서 | `DEPLOYMENT-STRATEGY.md`와 겹침 | 그 문서는 환경 전략, 이 문서는 설치 절차로 역할 분리 |

---

## 5. 테스트·검증 계획

**스크립트 단위**
- U-1 env 인벤토리: 누락 키를 정확히 보고, 주석/기본값 표기를 오탐하지 않음
- U-2 마이그레이션 검출: 적용된 SQL은 조용, 미적용은 목록에 나옴
- U-3 시크릿 생성기 출력이 `assert-secrets` placeholder 정규식에 걸리지 않음

**리허설(스테이징 호스트에서, 별도 프로젝트명으로 격리)**
- R-1 빈 상태에서 스택 기동 → 부팅 로그 · `/api/v1/health` · `/widget/` 200
- R-2 첨부 업로드 → **컨테이너 재생성 후에도 바이트 동일**(볼륨이 실제로 붙었는가)
- R-3 백업 → 업로드 볼륨 삭제 → 복원 → 첨부 바이트 동일 · 행/파일 수 일치
- R-4 미적용 SQL이 있는 상태에서 배포 스크립트가 **멈추고 목록을 보여주는가**
- R-5 시크릿을 placeholder로 두면 **부팅이 거부되는가**(의도된 실패)

---

## 6. 승인 요청

| 항목 | 계획값 |
|---|---|
| 산출물 | `docker/self-hosted/`(compose·Dockerfile.widget·nginx·env 템플릿) + `scripts/` 5종 + 설치 런북 |
| 기존 자산 | `docker/staging/`·`docker/production/` **유지**(용도 구분만 문서화) |
| env 템플릿 | 코드에서 생성·검증(CI 게이트), 3구획 분류 |
| 마이그레이션 | 스크립트는 **검출만**, 실행은 사람(kit 04) |
| 백업 | DB + **업로드 볼륨** 둘 다, 복원 후 첨부 정합성 확인 |
| 검증 | 스테이징 호스트에서 격리 리허설 R-1~R-5 |
| 비범위 | k8s·테라폼·레지스트리 발행·모니터링·자동 백업 스케줄 |

위 내용으로 **구현 착수 승인**을 요청합니다.

> **승인됨 — 2026-08-20, 사용자.** 이 계획으로 W1~W6을 구현했고 결과는
> `TCR-260820-Deployment-Package.md`에 있다.

---

## 7. 관련 문서

- `docs/analysis/REQ-260819-Widget-Theming-Embed-SDK.md` §3.3 FR-D1~D5, §7 배포 모델
- `docs/guide/DEPLOYMENT-STRATEGY.md` — 환경 전략(브랜치→환경)
- `docs/guide/STAGING-DEPLOY.md` — 스테이징 런북(구조 참고)
- `docs/implementation/RPT-260814-Chat-Attachments.md` §8 R-4 — 업로드 볼륨 백업 미비
