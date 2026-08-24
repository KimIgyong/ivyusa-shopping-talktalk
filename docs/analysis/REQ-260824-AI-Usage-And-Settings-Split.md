# REQ-260824-AI-Usage-And-Settings-Split

AI 엔진 사용량 통계 + 테넌트 설정 페이지 분할 — 요구사항 분석

- 요청일: 2026-08-24
- 대상: `https://shoptalk.amoeba.site/settings`
- 요청 요지:
  - **A. AI engines 사용량 메뉴 추가** — 현재 쓰는 엔진이 *테넌트 개별*인지 *전체 공통*인지 표시,
    AI 토큰을 쓰는 **메뉴별 사용량**을 일간·주간·월간·기간지정·누적으로 통계
  - **B. 설정 페이지를 메뉴 그룹별 별도 페이지로 분할** — Basic / Etc / Widget /
    Platform Integrations / Marketing & Helpdesk / External messenger (미언급 항목은 Etc)
- 선행: `REQ/PLN-260824-Tenant-AI-Engines`(테넌트 엔진), `PLN-260812-Menu-Provisioning-Access`

---

# A. AI 엔진 사용량

## A-1. AS-IS — 셀 수 있는 것이 없습니다 ⚠️

**토큰 수는 계산되지만 저장되지 않습니다.**

어댑터는 매 호출마다 `tokensIn`/`tokensOut`을 돌려주고(`ai-adapter.interface.ts:17`),
`RagService`는 그것을 호출자에게 전달합니다(`rag.service.ts:402`). 그리고 **거기서 끝납니다** —
`ai_usage` 같은 테이블도, `messages`의 토큰 컬럼도 없습니다. 코드 전체에서 토큰 값을 저장하는
곳은 0곳입니다.

> **따라서 이 요구사항은 리포팅 기능이 아니라 계측 기능입니다.** 화면을 먼저 만들면 보여줄
> 숫자가 없습니다. 기록을 시작한 시점부터의 데이터만 존재하며, **소급 통계는 불가능**합니다.

## A-2. 계측 지점은 하나입니다 ✅

모든 AI 호출이 `AiGatewayService.complete()`를 지납니다(`ai-gateway.service.ts:100`).
호출자는 rag·coach·briefing·moderation·kb-conflict 등 여러 곳이지만, **어댑터를 직접 부르는
곳은 게이트웨이뿐**입니다(연결 테스트 제외).

게이트웨이는 기록에 필요한 것을 이미 전부 알고 있습니다:

| 아는 것 | 출처 |
|---|---|
| `tenantId` · `function` | `GatewayRequest` |
| 엔진 id·프로바이더·모델 | `resolveRouting()` |
| **엔진이 테넌트 것인지 플랫폼 것인지** | `engine.tenantId` / `ROUTING_SOURCE` |
| `tokensIn` · `tokensOut` | 어댑터 응답 |
| stub 폴백 여부 | catch 분기(`:117`) |

**따라서 계측은 한 곳에 넣습니다.** 호출자 10여 곳에 흩으면 새 호출자가 생길 때마다 조용히
누락됩니다.

## A-3. "메뉴별"이 무엇을 뜻하는지 정해야 합니다

게이트웨이가 아는 축은 **`function` 6종**(chat/rag/summary/assist/moderation/coach)입니다.
콘솔 "메뉴"와는 일치하지 않습니다.

| 콘솔 메뉴 | 실제 function | 비고 |
|---|---|---|
| 대화(위젯 응답) | `chat`, `rag` | 한 번의 답변에 둘 다 쓰임 |
| 라이브챗 상담원 보조 | `assist` | |
| AI 코칭 | `coach` | |
| 지식 충돌 검토 | `summary` | 지식 메뉴에서 호출 |
| 모더레이션 | `moderation` | 메뉴가 아니라 모든 출력에 걸림 |
| 상담원 브리핑 | `summary` | 라이브챗 메뉴에서 호출 |

`summary` 하나에 **지식 충돌 검토와 상담원 브리핑이 섞입니다.** 메뉴 단위로 나누려면
호출자가 더 가는 라벨(`feature`)을 함께 넘겨야 합니다 → §A-6 D2.

## A-4. 엔진 출처 표시는 이미 있습니다

"테넌트 개별인지 전체 공통인지"는 `resolveRouting()`이 `source`로 답합니다 —
`EXPLICIT` / `INHERITED` / `TENANT_DEFAULT` / `PLATFORM_DEFAULT` / `NONE`. AI 설정 화면이
이미 이 값을 표시합니다. 사용량 화면에서는 **엔진별로 소유 주체를 함께** 보여주면 됩니다.

⚠️ 다만 **과금 주체가 갈립니다.** 테넌트 키로 나간 호출은 테넌트에게, 플랫폼 키로 나간 호출은
운영사에 청구됩니다. 사용량 통계는 이 둘을 **합산해 보여주면 오해를 만듭니다** → D3.

## A-5. 갭 분석 (A)

| # | 갭 | 대응 |
|---|-----|------|
| **A-G1** | 토큰 사용 기록이 없음 | `ai_usage_daily` 롤업 테이블 신설. `question_stat_daily`가 선례 |
| **A-G2** | 계측 코드 없음 | 게이트웨이 `complete()` 한 곳에 기록. 실패해도 **응답을 막지 않음**(fire-and-forget + 경고) |
| **A-G3** | 메뉴↔function 불일치 | 호출자가 `feature` 라벨을 넘기도록 확장(선택 필드, 미지정은 function으로 폴백) |
| **A-G4** | stub 폴백이 사용량에 섞임 | stub은 토큰 0·비용 0이므로 **분리 집계**. 섞으면 "왜 이렇게 싼가"를 설명 못 함 |
| **A-G5** | 화면 없음 | 설정 하위 페이지 + 기간 선택(일/주/월/기간지정/누적) |
| **A-G6** | 과금 주체 구분 없음 | 엔진 소유(tenant/platform)를 집계 축에 포함 |
| **A-G7** | 보존 기간 정책 없음 | 일별 롤업이라 행 증가는 완만하나 무한 누적 → 보존 정책 필요 |

**스키마 변경 필요** — 신규 테이블 1개.

---

# B. 설정 페이지 분할

## B-1. AS-IS

`SettingsPage.tsx` **1,316줄**에 15개 섹션이 세로로 쌓여 있습니다. 대부분은 **이미 별도
컴포넌트**입니다(`AiEngineCard` `EmbedCard` `WidgetBehaviorCard` `WidgetTabsCard`
`WidgetThemeCard` `NotificationChannelsCard` `StorefrontCard` `HandoffSection`
`MenuAccessSection` `Cafe24ConnectCard` `InstallGuideCard` `MessengerChannelsSection`).

인라인으로 남은 것은 **integration credentials 표**와 **provider 타일 그리드**(ecommerce /
marketing / helpdesk) 정도입니다.

> **분할의 대부분은 이동입니다.** 컴포넌트를 새 페이지로 나눠 담고 라우트를 붙이는 일이며,
> 각 카드를 다시 만드는 일이 아닙니다.

## B-2. 진짜 쟁점은 메뉴 권한 시스템입니다 ⚠️

메뉴 카탈로그의 주석이 규칙을 명시합니다(`menu.types.ts:12`):

> **A menu code is one SCREEN, not one capability.**

지금 `settings`는 코드 1개 = 화면 1개입니다. 6개 페이지로 나누면 **화면이 6개**가 되고, 이
규칙대로면 코드도 6개여야 합니다. 그 순간 다음이 따라옵니다:

- `PLAN_MENUS` 프리셋(starter/pro/enterprise)이 `MENU.SETTINGS`를 참조 → 갱신 필요
- 테넌트별 제공 예외(`tenant_menus`), 역할별(`tenant_role_menus`), 사용자별(`tenant_user_menus`)이
  코드로 저장됨 → **기존 행의 이관 규칙 필요**
- 좌측 내비게이션이 6줄 늘어남(또는 2단 구조가 필요)

**스테이징 실측**: `tenant_menus` 39행이 있으나 **`settings` 코드를 참조하는 행은 0건**입니다
(제공 예외 39건은 다른 메뉴). 역할별·사용자별도 0건.

```
tm_settings  trm_settings  tum_settings  tm_all
0            0             0             39
```

즉 **지금 이관해야 할 저장 데이터는 없습니다.** 분할하기에 지금이 가장 싼 시점입니다.

## B-3. 요청된 그룹과 현재 섹션의 대응

| 요청 그룹 | 들어갈 것 | 현재 위치 |
|---|---|---|
| **Basic Setting** | AI engines · Storefront · Agent handoff | `AiEngineCard` · `StorefrontCard` · `HandoffSection` |
| **Widget Setting** | Widget theme · Widget tabs · Widget behavior · Embed & SDK · Install on your store | 각각 별도 카드 |
| **Platform Integrations** | Shopify · Cafe24 · WooCommerce · Odoo · Haravan · Self Development + Cafe24 OAuth | `ECOMMERCE_PROVIDERS` 타일 + `Cafe24ConnectCard` |
| **Marketing & Helpdesk** | Klaviyo · Yotpo · Gorgias | `MARKETING_PROVIDERS` + `HELPDESK_PROVIDERS` 타일 |
| **External messenger** | Telegram · Viber · Amoeba Talk Hub · btbz relay · Zalo · LINE · WhatsApp · Gmail | `MessengerChannelsSection` |
| **Etc Setting** | Menu access · Integration credentials · Notification channels **+ 미언급 전부** | `MenuAccessSection` · 자격증명 표 · `NotificationChannelsCard` |
| **(신규)** | **AI engines 사용량** | 없음 — A파트 |

**"Self Development" = 자체 개발 연동**(2026-08-24 확정). 상점을 직접 개발한 테넌트가 붙는
경로이며, 백엔드에는 이미 **범용 이행 웹훅과 시크릿 회전**이 있습니다
(`webhook-secret.service.ts`, `INTEGRATION_PROVIDER.FULFILLMENT`). 다만 **콘솔에 그 화면이
없습니다** — 지금은 환경변수와 API로만 다룰 수 있습니다. 이 타일이 그 표면을 처음으로 드러냅니다.

## B-4. 갭 분석 (B)

| # | 갭 | 대응 |
|---|-----|------|
| **B-G1** | 화면이 1개 | 6개 페이지 + 라우트. 컴포넌트는 이동만 |
| **B-G2** | 메뉴 코드가 1개 | 코드를 늘릴지 유지할지 결정 → D4 |
| **B-G3** | `PLAN_MENUS` 프리셋 | D4에 따라 갱신 |
| **B-G4** | 내비게이션 구조 | 6줄 평면 vs 접이식 2단 → D6 |
| **B-G5** | 인라인 섹션 2개 | 자격증명 표·프로바이더 타일을 컴포넌트로 추출 |
| **B-G6** | i18n 키가 `settings` 한 네임스페이스 | 유지(분할 불필요), 페이지 제목 키만 추가 |
| **B-G7** | 기존 `/settings` 링크·북마크 | 첫 페이지로 리다이렉트 |

---

## 5. 제약·전제

- **C1.** **소급 통계 불가**(§A-1). 계측을 배포한 시점부터 쌓입니다. 화면에 "집계 시작일"을
  명시하지 않으면 "지난달 사용량이 왜 0인가"라는 질문이 반드시 나옵니다.
- **C2.** 계측 실패가 **AI 응답을 막으면 안 됩니다.** 기록은 부수 효과이지 대화의 일부가 아닙니다.
- **C3.** stub 폴백은 토큰 0입니다. 실제 호출과 섞으면 사용량이 조용히 과소 표시됩니다(A-G4).
- **C4.** 임베딩(`embed()`)도 토큰을 씁니다(Voyage). `complete()`와 별개 경로이므로 함께
  계측할지 정해야 합니다 → D7.
- **C5.** 메뉴 코드를 늘리면 **어드민 제공 화면과 테넌트 위임 화면 모두** 항목이 늘어납니다
  ([[menu-provisioning-access]]).
- **C6.** 페이지 분할은 URL을 바꿉니다. 기존 `/settings` 진입을 깨지 않아야 합니다(B-G7).
- **C7.** 비용(금액) 표시는 프로바이더별 단가표가 필요하고 모델마다 다릅니다. **토큰 수까지만**
  다루고 금액은 범위 밖으로 두는 편이 안전합니다 → D8.

## 6. 열린 결정 (PLN에서 확정)

| # | 결정할 것 | 선택지 | 권장 |
|---|---|---|---|
| **D1** | 집계 단위 | (a) 일별 롤업 1행/(테넌트,기능,엔진) (b) 호출별 원본 로그 | **(a)** — 주/월/기간은 일별에서 합산되고, 원본 로그는 대화량에 비례해 무한 증가 |
| **D2** | "메뉴별"의 축 | (a) `function` 6종 (b) 호출자가 넘기는 `feature` 라벨 | **(b)** — `summary` 하나에 지식검토·브리핑이 섞입니다(§A-3). 미지정은 function으로 폴백 |
| **D3** | 과금 주체 표시 | (a) 합산만 (b) **테넌트 키 / 플랫폼 키 분리 집계** | **(b)** — 합산은 청구서와 맞지 않습니다 |
| **D4** | 메뉴 코드 | (a) `settings` 1개 유지, 페이지는 하위 탭 (b) **6개로 분리** | **(b)** — 카탈로그 규칙이 "1코드=1화면"이고, 지금 이관할 저장 데이터가 **0건**입니다(§B-2). 나중에 하면 비쌉니다 |
| **D5** | "Self Development" | — | **확정(2026-08-24): 자체 개발 연동.** 상점을 직접 만든 테넌트가 붙일 자리이며, 백엔드에는 이미 범용 이행 웹훅과 시크릿 회전이 있으나(`webhook-secret.service.ts`, `INTEGRATION_PROVIDER.FULFILLMENT`) **콘솔에 노출된 화면이 없습니다** |
| **D6** | 내비게이션 | (a) 6줄 평면 (b) `설정` 접이식 2단 | (b) — 좌측 메뉴가 이미 16개입니다 |
| **D7** | 임베딩 토큰 | (a) 포함 (b) 이번 범위 밖 | (a) 포함 — 지식 색인이 토큰을 실제로 많이 씁니다 |
| **D8** | 금액 표시 | (a) 토큰만 (b) 단가표로 금액 추정 | **(a)** — 모델별 단가는 바뀌고, 틀린 금액은 없느니만 못합니다 |
| **D9** | 보존 기간 | (a) 무기한 (b) 13개월(전년 동월 비교 가능) | (b) |

## 7. 결론

**A는 리포팅이 아니라 계측입니다.** 토큰은 계산되지만 저장되는 곳이 코드 전체에 0곳이며,
소급 집계가 불가능합니다. 다행히 **모든 호출이 게이트웨이 한 곳을 지나므로** 계측 지점은
하나이고, 게이트웨이는 테넌트·기능·엔진·소유주체·토큰을 이미 전부 알고 있습니다.

**B는 대부분 이동입니다.** 15개 섹션 중 12개가 이미 독립 컴포넌트입니다. 실제 쟁점은 UI가
아니라 **메뉴 권한 시스템**이며, 카탈로그 규칙("1코드=1화면")대로면 코드가 6개로 늘어납니다.
그리고 **지금 이관할 저장 데이터가 0건**이라, 나누기에 가장 싼 시점입니다.

**"Self Development"는 자체 개발 연동으로 확정**됐습니다(D5). 여기서 하나가 더 드러납니다 —
범용 이행 웹훅과 시크릿 회전은 **백엔드에 이미 있는데 콘솔에 화면이 없습니다.** 이 타일은
새 기능을 만드는 것이 아니라 **이미 있는 표면을 처음으로 보이게 하는 일**입니다.

다음 단계: `PLN-260824-AI-Usage-And-Settings-Split.md`(ASCII 와이어프레임 포함) — **승인 후 구현**.
