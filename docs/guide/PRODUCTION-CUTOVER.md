# 프로덕션 컷오버 런북 (Production Cutover)

| | |
|---|---|
| Doc ID | CHATWIDGET-GUIDE-PRODCUT-1.0.0 |
| 작성일 | 2026-08-13 |
| 상태 | **점검 완료 — 착수 전 차단 요인 2건(§1) 해소 필요** |
| 대상 | 스테이징에서 검증된 `main`을 프로덕션으로 처음 올리는 작업 |
| 선행 | `docs/guide/DEPLOYMENT-STRATEGY.md` (승격 흐름·환경 정책) |

---

## 0. 현재 상태

프로덕션은 **아직 존재하지 않습니다.**

| 항목 | 상태 |
|---|---|
| 호스트 | 미프로비저닝 |
| `docker/production/.env.production` | **없음** (예시 파일만 존재) |
| `production` 브랜치 | **없음** |
| 배포 스크립트·compose·nginx | ✅ 준비됨 |
| 스테이징 | ✅ 가동 중, 최신 `main` 검증 완료 |

---

## 1. 착수 전 차단 요인 (반드시 먼저 해소)

### B1 — 첫 부팅 스키마가 **28개 테이블 뒤처져 있습니다** 🔴

프로덕션 MySQL은 첫 부팅에 `docker/init-sql/01-schema.sql`을 실행합니다(compose가 `/docker-entrypoint-initdb.d`로 마운트). 이 파일과 실제 운영 스키마의 차이:

| | 테이블 수 |
|---|---|
| `docker/init-sql/01-schema.sql` | **41** |
| 스테이징 실제 DB | **68** |

빠진 28개 (기능 단위로 묶음):

```
코칭        agent_coaching_threads / _messages / _proposals
메신저      messenger_channels · channel_threads · channel_outbox · channel_message_map · external_tickets
이슈        issues · issue_events
지식        kb_conflicts · kb_document_revisions · kb_answer_proposals · knowledge_gap_tasks · answer_reuse
통계        question_stats_daily · question_clusters
상품·앱     products_cache · product_saves · nudges · diary_notes · device_tokens
보안        mfa_credentials · mfa_recovery_codes
메뉴        tenant_menus · tenant_role_menus · tenant_user_menus
승인        reply_drafts
```

**이대로 배포하면 API는 뜨지만 기능 대부분이 500으로 죽습니다.** `DB_SYNCHRONIZE=false`라 런타임에 만들어지지도 않습니다.

> 덧붙여 **스키마 파일이 두 벌**입니다 — `sql/01-schema.sql`(48개)과 `docker/init-sql/01-schema.sql`(41개)이 서로 다르고 둘 다 낡았습니다. 진실의 출처가 둘이면 다음 사람도 같은 함정에 빠집니다.

**해소안 (권장순)**

| 안 | 방법 | 평가 |
|---|---|---|
| **ㄱ (권장)** | 스테이징에서 `mysqldump --no-data`로 스키마를 떠서 `docker/init-sql/01-schema.sql`을 재생성하고, `sql/01-schema.sql`은 **삭제하거나 심볼릭 참조로 일원화** | 실제 가동 중인 스키마와 1:1. 마이그레이션 51개를 순서대로 재생할 필요 없음 |
| ㄴ | 41테이블 스키마 + `sql/migration_*.sql` 51개를 순서대로 적용 | 순서 의존·중복 적용 위험. 일부는 이미 스키마에 반영돼 있어 판별 필요 |
| ㄷ | 첫 부팅만 `DB_SYNCHRONIZE=true` | **비권장** — 엔티티가 만든 스키마는 인덱스·주석·컬럼 타입이 운영 스키마와 미묘하게 다르고, 그 차이를 아무도 검증하지 않음 |

### B2 — 인프라·자격증명 (사용자 결정 필요) 🟡

| 항목 | 필요한 것 |
|---|---|
| 호스트 | 서버 + Docker + compose |
| DNS·TLS | 도메인 → 호스트, TLS 종단(호스트 nginx 또는 LB) |
| `.env.production` | `DB_*`·`RABBITMQ_*`·`JWT_*`·`CRED_ENC_KEY`(신규 32B)·`ANTHROPIC_API_KEY`·`VOYAGE_API_KEY`·`VITE_API_BASE_URL` |
| Shopify | 프로덕션 앱 등록 또는 기존 앱의 콜백 URL 추가 |
| SMTP | 오프아워 회신 발신 계정 |

> `VITE_API_BASE_URL`은 **빌드 시점에 번들에 박힙니다.** 도메인이 정해지기 전에는 web/widget을 빌드해도 소용없습니다.

---

## 2. 컷오버 순서

```
① 스키마 재생성(B1)         → 커밋
② 호스트·DNS·TLS 준비(B2)
③ .env.production 작성       → 서버에만 보관(절대 커밋 금지)
④ production 브랜치 생성      → 검증된 main 커밋을 승격
⑤ 첫 배포 + 첫 부팅 시드
⑥ 테넌트 데이터 이관(§3)     ← 코드로 오지 않는 것들
⑦ 스모크 테스트(§4)
⑧ SEED_ON_BOOT=false 로 전환 후 재배포
```

---

## 3. 코드로 오지 않는 것들 (놓치기 쉬움)

배포만으로는 동작하지 않고, **사람이 넣어야** 하는 데이터입니다.

| # | 항목 | 근거 |
|---|---|---|
| 1 | **AI 엔진 등록 + API 키** | 시드는 stub 엔진만 만듭니다. Anthropic 엔진을 콘솔에 등록하고 키를 넣지 않으면 **조용히 stub 응답**이 나갑니다 (PR #102에서 겪은 실패) |
| 2 | **응답 규칙 5번** | `DEFAULT_RULES` 변경은 **신규 테넌트에만** 적용됩니다. 기존 테넌트를 이관하는 경우 "연결을 약속하지 말 것"을 콘솔에서 직접 반영해야 합니다 (RPT-260813) |
| 3 | **핸드오프 설정** | 업무시간·타임존·오프아워 메일함·담당자. 비어 있으면 24시간 상담원 호출로 동작합니다 |
| 4 | **지식 문서** | 정책 224건 + 상품지식. CSV 임포트 / 카탈로그 동기화 / 사용법 가이드 10~12건은 **각각 실행**해야 합니다 |
| 5 | **재위임 안내 문구** | 기본 문구로 동작하나 IVY 확정본이 있으면 반영 |
| 6 | **모더레이션 규칙** | 시드가 기본 2건을 넣지만 운영 규칙은 별도 |
| 7 | **상담원 계정** | 초대 → 임시 비밀번호 전달 → 첫 로그인 시 변경. **8/14부터 master/director는 MFA 강제** |

---

## 4. 스모크 테스트 (배포 직후)

| # | 확인 | 기준 |
|---|---|---|
| 1 | 부팅 | 로그에 `Nest application successfully started` + `Qdrant connected` |
| 2 | 헬스 | `/api/v1/health` → `{"status":"ok","db":"up"}` |
| 3 | 라우트 | 보호 라우트가 **401**(404면 미배포, 502면 API 다운) |
| 4 | 위젯 | 세션 생성 → 동의 → 질문 → **실제 LLM 응답 + 근거 인용**(stub 문구가 아닌지 확인) |
| 5 | 이관 | "상담원 연결해 주세요" → `escalate=true`, 상담원 알림 |
| 6 | 잡담 | "안녕하세요" → **이관 없이** 응답 |
| 7 | 방치 순회 | 부팅 로그에 `Idle sweep every 30s …` |
| 8 | 주문 | Shopify 동기화 1회 + 위젯 주문 조회 |
| 9 | 모더레이션 | 차단 규칙이 실제로 차단하는지 |
| 10 | 시드 | 확인 후 **`SEED_ON_BOOT=false`** 로 전환 |

---

## 5. 롤백

| 상황 | 조치 |
|---|---|
| 배포 실패 | 이전 이미지로 재기동(`docker compose up -d` + 이전 커밋) |
| 스키마 문제 | 첫 배포 전 **DB 볼륨 스냅샷**을 반드시 확보. 초기 부팅 스키마는 **DB가 비어 있을 때만** 실행되므로, 잘못 뜨면 볼륨을 비우고 다시 시작하는 것이 가장 빠름 |
| 데이터 유입 후 | 스키마 되돌리기는 개별 SQL 롤백(각 `migration_*.sql` 상단에 롤백문 기재됨) |

---

## 6. 권고

**B1을 먼저 처리하십시오.** 호스트가 준비돼도 스키마가 28개 뒤처진 상태로는 첫 배포가 실패합니다. 스키마 재생성은 스테이징 접근만으로 가능하고 위험이 없으므로, 인프라 준비와 **병행할 수 있는 유일한 항목**입니다.

그 다음은 §3입니다. 과거 스테이징 배포에서 반복적으로 사고가 난 지점이 **"코드는 갔는데 데이터가 없어서 조용히 stub으로 도는"** 경우였습니다.
