# PLN-260824-AI-Usage-And-Settings-Split

AI 엔진 사용량 통계 + 테넌트 설정 페이지 분할 — 구현 계획

- 근거: `docs/analysis/REQ-260824-AI-Usage-And-Settings-Split.md`
- 승인된 결정(2026-08-24): D1 일별 롤업 · D2 `feature` 라벨 · D3 과금주체 분리 ·
  **D4 메뉴 코드 6개 분리** · **D5 Self Development = 자체 개발 연동** · D6 접이식 2단 ·
  D7 임베딩 포함 · D8 금액 범위 밖 · D9 13개월 보존
- 원칙: A는 **계측을 먼저**, B는 **이동을 먼저**. 둘은 독립적이므로 PR을 나눕니다.

## 0. 두 갈래를 나누는 이유

```
A 사용량   계측(게이트웨이 1곳) → 롤업 테이블 → 조회 API → 화면
           ⚠️ 배포한 날부터 쌓임. 화면만 먼저 내면 빈 화면이 됨

B 분할     컴포넌트 이동 + 라우트 + 메뉴 코드 6개
           ⚠️ 메뉴 권한 시스템을 건드림. 지금 이관 대상 0건
```

**PR을 나눕니다.** A는 스키마 변경이 있고 B는 없습니다. 묶으면 롤백 단위가 커지고,
B의 UI 회귀가 A의 계측 배포를 붙잡습니다.

---

# A. AI 사용량 (PR 1·2)

## A-1. 스키마

```sql
CREATE TABLE ai_usage_daily (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT      NOT NULL,
  stat_date    DATE        NOT NULL,
  -- 무엇이 썼나. function(6종)보다 가늘다 — summary 하나에 지식검토와
  -- 브리핑이 섞이므로 호출자가 넘긴 라벨을 쓰고, 없으면 function으로 채운다.
  feature      VARCHAR(32) NOT NULL,
  ai_function  VARCHAR(16) NOT NULL,
  engine_id    BIGINT      NULL,      -- 삭제된 엔진의 과거 사용량도 남는다
  provider     VARCHAR(24) NOT NULL,
  model        VARCHAR(64) NOT NULL,
  -- 청구가 누구에게 가는지. 합산하면 청구서와 맞지 않는다(D3).
  engine_owner VARCHAR(10) NOT NULL,  -- tenant | platform
  calls        INT    NOT NULL DEFAULT 0,
  tokens_in    BIGINT NOT NULL DEFAULT 0,
  tokens_out   BIGINT NOT NULL DEFAULT 0,
  -- stub은 토큰 0이다. 실호출과 섞으면 사용량이 조용히 과소 표시된다.
  stub_calls   INT    NOT NULL DEFAULT 0,
  failures     INT    NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ai_usage (tenant_id, stat_date, feature, ai_function, engine_id, engine_owner),
  KEY idx_ai_usage_lookup (tenant_id, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`engine_id`를 NULL 허용으로 둡니다 — 엔진이 지워져도 **지난 사용량은 남아야** 합니다.
`question_stat_daily`(`uk_qstat`)와 같은 롤업 모양입니다.

## A-2. 계측 (W1)

- `AiUsageService.record()` — `INSERT … ON DUPLICATE KEY UPDATE`로 일별 누적.
- `AiGatewayService.complete()` **한 곳**에서 호출:
  - 성공 → `calls+1`, 토큰 누적
  - stub 폴백(`catch` 분기) → `stub_calls+1`, `failures+1`
  - `resolveRouting`이 준 `engine`으로 `provider/model/owner` 결정
    (`engine.tenantId == null ? 'platform' : 'tenant'`)
- ⚠️ **기록 실패가 응답을 막지 않습니다**(C2). `void record().catch(warn)` —
  대화는 계속되고 경고만 남습니다. 기록은 부수 효과이지 대화의 일부가 아닙니다.
- `GatewayRequest`에 **선택 필드 `feature?: string`** 추가. 미지정이면 `function` 값으로 채웁니다.
  호출자 라벨 부여:

| 호출자 | feature |
|---|---|
| `rag.service` 답변 | `chat_answer` |
| `rag.service` 재작성·요약 보조 | `chat_rewrite` |
| `ai-coach.service` | `coaching` |
| `briefing.service` | `agent_briefing` |
| `kb-conflict.service` | `knowledge_conflict` |
| `moderation.service` | `moderation` |
| 그 외 | function 값 그대로 |

- **임베딩도 계측**(D7): `embed()`는 `tokensIn`만 있고 출력이 없으므로 `tokens_out=0`,
  `feature='embedding'`. Voyage 키가 없을 때의 stub은 `stub_calls`로.

## A-3. 조회 API (W1)

- `GET /tenants/me/ai-usage?from=&to=&group_by=feature|function|engine|owner`
  - 일·주·월은 **모두 일별 행의 합산**입니다. 별도 테이블을 만들지 않습니다.
  - 응답에 **`since`(집계 시작일)** 포함 — C1의 "지난달이 왜 0인가"를 화면이 스스로 답하게.
- capability: `AI_SETTINGS_MANAGE`(기존). 새 권한을 만들지 않습니다 — 읽기 전용 통계입니다.

## A-4. 화면 (W2)

설정 하위 **AI engines** 페이지 안에 둡니다(요청대로 "AI engines 사용량").

```
┌ AI 엔진 ───────────────────────────────────────────────┐
│ 현재 사용 중                                            │
│  기능        엔진                    출처               │
│  대화        Claude (go2joy)         ● 내 엔진          │
│  RAG         Claude (go2joy)         ● 내 엔진          │
│  요약        Anthropic Claude        ○ 공통(플랫폼)     │
│  모더레이션   Anthropic Claude        ○ 공통(플랫폼)     │
│    └ 출처: 내 엔진 = 우리 키로 호출·우리에게 청구        │
│            공통    = 운영사 엔진·운영사에 청구           │
└─────────────────────────────────────────────────────────┘

┌ 사용량 ──────── [일] [주] [월] [기간지정] [누적] ───────┐
│ 2026-08-01 ~ 08-24                집계 시작 2026-08-25 ⓘ│
│                                                         │
│  기능             호출     입력 토큰   출력 토큰         │
│  대화 응답        1,204    842,110     96,220           │
│  상담원 브리핑      312     58,900     12,400           │
│  코칭               88     21,300      4,900           │
│  지식 충돌 검토      12      9,800      1,100           │
│  임베딩            520    310,400          0           │
│  ─────────────────────────────────────────────         │
│  내 엔진 합계     1,616  1,132,110    109,620          │
│  공통 엔진 합계     520    310,400          0          │
│  ⚠ stub 폴백 3회 — 토큰 0, 실제 응답 아님               │
└─────────────────────────────────────────────────────────┘
```

**과금 주체를 합산하지 않습니다**(D3). 두 줄로 나눠야 청구서와 대조됩니다.
**금액은 표시하지 않습니다**(D8) — 모델별 단가가 바뀌고, 틀린 금액은 없느니만 못합니다.

---

# B. 설정 페이지 분할 (PR 3)

## B-1. 페이지와 메뉴 코드

| 페이지 | 라우트 | 메뉴 코드 | 담을 것 |
|---|---|---|---|
| Basic Setting | `/settings/basic` | `settings_basic` | AI engines(+사용량) · Storefront · Agent handoff |
| Widget Setting | `/settings/widget` | `settings_widget` | Theme · Tabs · Behavior · Embed & SDK · Install guide |
| Platform Integrations | `/settings/platforms` | `settings_platforms` | Shopify · Cafe24(+OAuth) · WooCommerce · Odoo · Haravan · **자체 개발 연동** |
| Marketing & Helpdesk | `/settings/marketing` | `settings_marketing` | Klaviyo · Yotpo · Gorgias |
| External Messengers | `/settings/messengers` | `settings_messengers` | Telegram · Viber · Amoeba Talk Hub · btbz relay · Zalo · LINE · WhatsApp · Gmail |
| Etc Setting | `/settings/etc` | `settings_etc` | Menu access · Integration credentials · Notification channels · **미언급 전부** |

- `/settings`는 **`/settings/basic`으로 리다이렉트**합니다(B-G7) — 기존 링크·북마크가 깨지지 않게.
- `MENU.SETTINGS`는 **남깁니다.** 삭제하면 `PLAN_MENUS`와 기존 nav 참조가 한꺼번에 깨집니다.
  대신 **부모 그룹**으로 쓰고, 6개 코드가 자식이 됩니다(D6 접이식 2단).
- `PLAN_MENUS`: `settings`가 있던 플랜에 6개를 함께 넣습니다. **starter도 동일** —
  줄이는 것은 영업 판단이며 이번 작업의 결정이 아닙니다([[menu-provisioning-access]]).

⚠️ **저장 예외 이관은 없습니다** — 스테이징 실측 `settings` 참조 행 0건(REQ §B-2).
프로덕션 배포 시 **같은 쿼리로 재확인**한 뒤 진행합니다.

## B-2. 자체 개발 연동 타일 (D5)

백엔드에는 **이미 있습니다** — 범용 이행 웹훅과 시크릿 회전(`webhook-secret.service.ts`,
`INTEGRATION_PROVIDER.FULFILLMENT`). 콘솔에 화면이 없을 뿐입니다.

```
┌ 자체 개발 연동 ─────────────────────────────────┐
│ 직접 만든 쇼핑몰을 붙일 때 씁니다.               │
│                                                 │
│ 주문/이행 웹훅 수신 주소                         │
│   https://shoptalk.amoeba.site/api/v1/...       │
│   [복사]                                        │
│ 서명 시크릿   ••••••••  (끝 4자 a1b2)  [재발급]  │
│   ⚠ 재발급하면 기존 시크릿은 즉시 무효가 되며,   │
│     보내는 쪽을 함께 바꿔야 합니다.              │
│                                                 │
│ 위젯 설치·SDK → Widget Setting 참조             │
└─────────────────────────────────────────────────┘
```

**새 기능을 만드는 것이 아니라 이미 있는 표면을 드러내는 일**입니다. 재발급의 파급을 문구로
명시합니다 — 조용히 바꾸면 상대 시스템이 그때부터 401을 받습니다.

## B-3. 이동 대상

이미 컴포넌트인 것(그대로 옮김): `AiEngineCard` `StorefrontCard` `HandoffSection`
`WidgetThemeCard` `WidgetTabsCard` `WidgetBehaviorCard` `EmbedCard` `InstallGuideCard`
`Cafe24ConnectCard` `MessengerChannelsSection` `NotificationChannelsCard` `MenuAccessSection`

**추출이 필요한 것 2개**(현재 `SettingsPage.tsx` 인라인):
- 자격증명 표 → `IntegrationCredentialsCard`
- 프로바이더 타일 그리드 → `ProviderGrid`(그룹을 prop으로)

## 1. 단계별 계획

| 단계 | 내용 | PR |
|---|---|---|
| **W1** | `ai_usage_daily` + 마이그레이션 · `AiUsageService` · 게이트웨이 계측 · 조회 API · 테스트 | PR 1 |
| **W2** | 사용량 화면(기간 선택·출처 분리) · i18n 6종 | PR 1 |
| **W3** | 설정 6분할 · 메뉴 코드 6개 · 자체 개발 연동 타일 · 리다이렉트 | PR 2 |
| **W4** | 배포(**SQL 선적용**) · 검증 · TCR/RPT | PR 3(docs) |

## 2. 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| **게이트웨이 `complete()`** | 모든 AI 호출이 지나는 경로에 쓰기 추가 | fire-and-forget, 실패해도 응답 계속. 지연 측정으로 확인 |
| `GatewayRequest` | 선택 필드 1개 추가 | 기존 호출자 무수정 동작(function 폴백) |
| stub 폴백 | 이제 `failures`로 계상 | 기존 동작 불변, 기록만 추가 |
| `PLAN_MENUS` | 코드 6개 추가 | starter 포함 동일 부여 |
| 메뉴 제공/위임 화면 | 항목 6개 증가 | 표시만 |
| 기존 `/settings` 링크 | 라우트 변경 | 리다이렉트 |
| i18n | 신규 키 다수 × 6언어 | `i18n:check` |
| DB 스키마 | **신규 테이블 1개** | SQL 선적용 |

## 3. 리스크

- **R1.** 계측이 **대화 경로에 있습니다.** 느리거나 던지면 고객 응답이 영향받습니다 →
  await 하지 않고, 실패는 삼키고 경고만.
- **R2.** `ON DUPLICATE KEY UPDATE`의 유니크 키에 `engine_id`가 들어갑니다. 엔진이 바뀌면
  같은 날에 행이 나뉘는데, **이는 의도**입니다(엔진별 사용량이 필요).
- **R3.** 소급 불가(C1)를 화면이 말하지 않으면 문의가 옵니다 → `since` 표시 필수.
- **R4.** 메뉴 코드 6개 추가는 **어드민 제공 화면**에도 나타납니다. 기존 테넌트가 전부
  `provided`로 보이는지 배포 후 확인.
- **R5.** 프로덕션에는 `settings` 참조 행이 있을 수 있습니다 → 배포 전 같은 쿼리로 재확인.

## 4. 테스트 (TCR에서 확장)
- 단위: 롤업 누적(같은 날 2회 호출 → 1행 누적) · stub 폴백 계상 · 기록 실패해도 응답 반환 ·
  feature 미지정 시 function 폴백 · owner 판정(tenant/platform) · 기간 합산(주/월)
- 통합: 실제 호출 1회 → 행 1개 · 엔진 삭제 후에도 과거 사용량 조회 가능
- 배포: SQL 선적용 → 라우트 401 → 실호출 후 행 생성 확인 → 6개 페이지 접근

---
**승인 요청**: 승인 시 **A(W1)부터** 착수합니다. 계측이 하루라도 빨리 들어가야 통계가 쌓입니다.
B는 그 뒤에 이어서 진행합니다.
