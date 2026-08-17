# PLN-260817-Widget-Tab-Config

주문 탭 복원 + 탭 구성/위치의 테넌트별 설정화 구현 계획.

- 작성일: 2026-08-17
- 선행: `docs/analysis/REQ-260817-Widget-Tab-Config.md`
- 기반: PR #301(`0178e83`) 스테이징 LIVE 상태
- **UI 변경 있음** → ASCII 와이어프레임 §3 포함

## 0. 확정 전제 (REQ §4)

| 항목 | 결정 |
|---|---|
| 칩 배치 | 주문 탭 ON → 알림 `전체`·`이벤트` / 주문 `결제`·`배송`·`리뷰`·`문의` |
| on/off | 세 탭 개별, **최소 1개 강제** |
| 형태 | 상단 = 라벨 세그먼트 / 하단 = 아이콘 + 라벨 |
| 챗 `My Orders` | 인라인 카드 유지 |
| 기본값 | 탭 `알림`·`채팅`, 위치 `상단` (= 현행) |
| 설정 위치 | 테넌트 `/settings` → 기존 **위젯 동작** 카드 |

## 1. 목표 / 비목표

**목표**
1. 테넌트가 위젯 탭 3종을 개별 on/off 하고, 탭 위치를 상단/하단으로 고른다.
2. 주문 탭을 **신 디자인 언어로** 되살린다(구 `OrdersTab` 복원이 아님).
3. 목록형 탭이 하나만 켜져도 6개 칩 기능이 하나도 사라지지 않는다.
4. **설정하지 않은 테넌트의 위젯은 오늘과 픽셀 단위로 동일하다.**

**비목표**
- 디자인 변경(팔레트·헤더·행·카드) — 요구 첫 문장이 "디자인은 그대로 유지하되".
- 탭 순서 커스터마이즈 — Q2에서 on/off만 확정.
- 플랫폼 어드민 제공 계층 — 테넌트 설정 단일 계층(REQ Q6 가정).

---

## 2. 설정 모델

### 2.1 스키마 (`tenants`)

| 컬럼 | 타입 | 기본 | 의미 |
|---|---|---|---|
| `widget_tabs` | `json NULL` | `NULL` | 노출 탭 배열. **NULL = 미설정 = 내장 기본값**(`['notifications','chat']`) |
| `widget_tab_position` | `varchar(8) NOT NULL` | `'top'` | `top` \| `bottom` |

> `widget_tabs`를 NOT NULL + 기본배열로 두지 않는 이유: `widget_copy`와 같은 방식으로
> **NULL을 "미설정"으로 남겨야** 나중에 내장 기본값을 바꿔도 손대지 않은 테넌트가 따라온다.
> 값을 박아버리면 전 테넌트 백필이 필요해진다.

정규화 규칙(서버):
- 알 수 없는 키 제거, 중복 제거, **표준 순서 고정** `notifications → orders → chat`.
- **빈 배열이면 400** (`VALIDATION_FAILED`) — 탭이 하나도 없는 위젯은 열 수 없다.

### 2.2 전달 경로 — 기존 배관에 그대로 얹는다

```
tenants.widget_tabs / widget_tab_position
  └─ UpdateWidgetSettingsRequest.tabs[] / tab_position   tenant.request.ts
      └─ TenantService.updateWidgetSettings              tenant.service.ts:279
          └─ TenantMapper → 콘솔 위젯 설정 응답            tenant.mapper.ts
              └─ /settings · WidgetBehaviorCard          SettingsPage.tsx:513
────────────────────────────────────────────────────────────────────
SessionService.ensure → SessionResponse.widgetTabs / widgetTabPosition
  └─ session.mapper.ts → 위젯 useSession → store          useSession.ts:176
```

신규 도메인 모듈 없음. 신규 화면 없음.

---

## 3. 와이어프레임

### W-1 상단 3탭 (기본 위치, 주문 탭 ON)

```
┌────────────────────────────────────────────────────────┐ 404×600
│  알림센터                            [KO] [⚙] [✕]      │
├────────────────────────────────────────────────────────┤
│    알림 ❹    │     주문     │     채팅 ❶               │ 라벨만·N등분
│    ━━━━━━━━━                                           │ 활성=검정bold+2px
├────────────────────────────────────────────────────────┤
│  (전체) (이벤트)                    ← 알림 탭 칩 2개    │ 주문 칩은 이관됨
├────────────────────────────────────────────────────────┤
│ ░░ 오늘 받은 알림 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ (✨) Mad Shade                                     ●   │
│      Buy one Get One 50% OFF today !                   │
└────────────────────────────────────────────────────────┘
   ※ 2탭일 때(기본)는 지금과 완전히 동일 — 라벨이 2등분될 뿐
```

### W-2 주문 탭 (신규, 신 디자인 언어)

```
├────────────────────────────────────────────────────────┤
│    알림 ❹    │     주문     │     채팅 ❶               │
│                 ━━━━━━━━━━━━                           │
├────────────────────────────────────────────────────────┤
│  (결제) (배송) (리뷰) (문의)        ← 이관된 칩 4개     │ pill·활성=검정
├────────────────────────────────────────────────────────┤
│  결제 : 알림 피드(category=payment) — 현행 행 그대로     │
│  배송 : ShipmentList(가로 스테퍼 + CTA) — 현행 그대로    │
│  리뷰 : ⭐ 리뷰 작성 CTA — 현행 그대로                   │
│  문의 : IssueFeed — 현행 그대로                          │
├────────────────────────────────────────────────────────┤
│              더 많은 주문 보기  ↗                       │ 몰 마이페이지
└────────────────────────────────────────────────────────┘
   ※ 새로 그리는 것은 "껍데기"뿐. 내용 컴포넌트는 전부 재사용
```

### W-3 하단 탭 (위치 = bottom)

```
┌────────────────────────────────────────────────────────┐
│  알림센터                            [KO] [⚙] [✕]      │ 헤더 동일
├────────────────────────────────────────────────────────┤
│  (전체) (이벤트)                                        │ 칩이 헤더 바로 아래
├────────────────────────────────────────────────────────┤
│                                                        │
│   … 본문 …                                             │
│                                                        │
├────────────────────────────────────────────────────────┤
│     🔔❹        📦          💬❶                        │ 아이콘 + 라벨
│     알림       주문        채팅                         │ 활성=primary-600
└────────────────────────────────────────────────────────┘
   ※ 모바일에서는 safe-area-inset-bottom 패딩 추가
```

### W-4 콘솔 `/settings` — 위젯 동작 카드에 2행 추가

```
┌─ 위젯 동작 ───────────────────────────────────────────┐
│ 로그인 방식      [ 리디렉션 ▾ ]                        │ (기존)
│ 타임존           [ Asia/Seoul ▾ ]                      │ (기존)
│ ─────────────────────────────────────────────────      │
│ 노출 탭          ☑ 알림   ☐ 주문   ☑ 채팅              │ ← 신규
│                  최소 한 개는 켜야 합니다.              │
│ 탭 위치          ( ● 상단 )  ( ○ 하단 )                │ ← 신규
│                  상단은 텍스트 세그먼트, 하단은         │
│                  아이콘+라벨로 표시됩니다.              │
│ ─────────────────────────────────────────────────      │
│ 위젯 문구 …                                            │ (기존)
│                                   [ 저장 ]             │
└────────────────────────────────────────────────────────┘
```

### W-5 칩 흡수 규칙 (REQ §4.1)

```
알림 ON  + 주문 ON   →  알림[전체·이벤트]      주문[결제·배송·리뷰·문의]
알림 ON  + 주문 OFF  →  알림[전체·결제·배송·이벤트·리뷰·문의]      ← 기본값·현행
알림 OFF + 주문 ON   →  주문[전체·결제·배송·이벤트·리뷰·문의]
알림 OFF + 주문 OFF  →  목록형 탭 없음 (채팅 단독)
```

---

## 4. 단계별 계획

### S1 — 스키마 + 계약
- `sql/migration_widget_tab_config.sql` — 컬럼 2개 추가(객체별 멱등 가드, PLN-260817 방식).
- `tenant.entity.ts` — `widgetTabs: string[] | null`(json), `widgetTabPosition: string`.
  ⚠️ nullable 컬럼은 `type` 명시(부팅 크래시 방지).
- `packages/types` — `WIDGET_TAB`(const object) · `WidgetTab` · `WIDGET_TAB_POSITION` · `WidgetTabPosition`,
  `SessionResponse.widgetTabs: WidgetTab[]` / `widgetTabPosition`.
- 정규화 유틸 `normalizeWidgetTabs()` → 표준 순서·중복 제거·빈 배열 거부. **단위 테스트 동반.**

### S2 — 백엔드 전달
- `UpdateWidgetSettingsRequest`에 `tabs?: string[]`(`@IsArray` + `@IsIn` each) · `tab_position?`(`@IsIn`).
- `TenantService.updateWidgetSettings` — 정규화 후 저장, `AuditService.write` 대상에 포함.
- `TenantMapper` — 콘솔 응답에 두 값 추가(미설정이면 내장 기본값을 **명시적으로** 내려 콘솔이 체크박스를 그릴 수 있게).
- `SessionService.ensure` + `session.mapper` — 위젯으로 전달.

### S3 — 위젯 탭 셸
| 작업 | 파일 |
|---|---|
| `TabKey`에 `'orders'` 복원, `visibleTabs`/`tabPosition` 상태 추가 | `store/widgetStore.ts` |
| session/ensure 값 반영 | `hooks/useSession.ts` |
| `TopTabs` N탭 대응(2/3 모두), 배지 매핑 확장 | `widget/TopTabs.tsx` |
| **신규** 하단 탭바(아이콘+라벨, safe-area) | `widget/BottomTabs.tsx` |
| 위치에 따라 상/하단 렌더, `tabpanel` 연결 유지 | `widget/WidgetPanel.tsx` |
| 활성 탭이 꺼진 탭이면 첫 번째 노출 탭으로 폴백 | `WidgetPanel`/store |

### S4 — 주문 탭 + 칩 흡수
| 작업 | 파일 |
|---|---|
| 칩 목록을 **탭별로 계산**하는 단일 함수(`chipsFor(tab, visibleTabs)`) | 신규 `notifications/tabChips.ts` |
| `NotificationsTab`을 칩 목록 주입형으로 일반화 | `NotificationsTab.tsx` |
| **신규** `OrdersTab` — 위 컴포넌트를 주문 칩으로 재사용하는 얇은 껍데기 | `orders/OrdersTab.tsx` |
| 주문 탭 배지 = 미읽음 중 `payment`/`shipping`/`review` 건수 | `TopTabs`/`BottomTabs` |
| `?reopen=orders` → 주문 탭 ON이면 주문 탭, 아니면 현행(알림+배송) | `widget/Widget.tsx` |

> **핵심**: `ShipmentList` · `IssueFeed` · `Row` · `OrderDetailView` · `ReviewForm`은 **손대지 않는다.**
> 바뀌는 것은 "어느 탭이 어떤 칩을 그리는가"뿐이다.

### S5 — 콘솔 설정 UI
- `WidgetBehaviorCard`에 체크박스 3개 + 라디오 2개, 저장 시 기존 mutation에 필드 추가.
- **최소 1개 강제**: 마지막 체크 해제를 UI에서 막고, 서버도 400으로 거부(이중 방어).
- 저장 성공/실패 토스트(dev-kit §4.3).

### S6 — i18n · 회귀
- 신규 키: 콘솔 `widgetBehavior.tabs*`/`tabPosition*`, 위젯 `tab.orders`(**이미 존재** — PR #301에서 미삭제).
- **en/es/ko/vi/ja/zh 전부** + `npm run i18n:check`.
- 회귀: 기본값 테넌트가 오늘과 동일한지(2탭·상단·칩 6개), 첨부·동의·이관·종료/CSAT.

---

## 5. 사이드 임팩트

| # | 영향 | 조치 |
|---|---|---|
| SI-1 | 기존 테넌트의 위젯이 바뀌면 **사고** | `widget_tabs` NULL = 현행. 회귀 케이스로 명시 검증(§6 R-1) |
| SI-2 | 활성 탭이 설정 변경으로 사라짐(세션 중 or 다음 방문) | 노출 탭 첫 번째로 폴백, 저장된 `activeTab`이 무효면 무시 |
| SI-3 | `?reopen=orders` 레거시 링크 | 주문 탭 ON/OFF 양쪽 모두 착지점 보장 |
| SI-4 | GA4 `tabView('orders')` 이벤트 부활 | PR #301에서 사라졌다가 돌아옴 — 대시보드 세그먼트 재확인 |
| SI-5 | 하단 탭 = 본문 높이 감소 | 챗 스크롤 영역·입력창 위치 재확인 |
| SI-6 | 하단 탭 + 모바일 홈 인디케이터 겹침 | `pb-[env(safe-area-inset-bottom)]` |
| SI-7 | 3탭 라벨 폭 (en `Notifications`/`Orders`/`Chat`) | 404px÷3 ≈ 134px. 축약 또는 `text-xs` 폴백 검증 필요 |
| SI-8 | 스키마 변경 | SQL 선적용 + PR `## Migration` |
| SI-9 | `widget_tabs` json에 임의 문자열 저장 위험 | 서버 정규화가 화이트리스트로 거름 |

---

## 6. 마이그레이션

```sql
-- sql/migration_widget_tab_config.sql (객체별 멱등 가드)
ALTER TABLE `tenants`
  ADD COLUMN `widget_tabs` json NULL AFTER `widget_copy`,
  ADD COLUMN `widget_tab_position` varchar(8) NOT NULL DEFAULT 'top' AFTER `widget_tabs`;
```
- **백필 없음** — NULL이 곧 "현행 유지".
- 롤백: 두 컬럼 DROP (구코드는 읽지 않음).
- 순서: 스테이징 DB 선적용 → 코드 배포. `pre-deploy-check` 스킬 사용.

---

## 7. 검증 관점 (TCR 예고)

| # | 케이스 | 기대 |
|---|---|---|
| R-1 | **미설정 테넌트** | 오늘과 동일: 상단 2탭, 알림 칩 6개 |
| R-2 | 주문 ON | 3탭, 알림 `전체·이벤트` / 주문 `결제·배송·리뷰·문의` |
| R-3 | 알림 OFF + 주문 ON | 주문 탭이 칩 6개 전부 흡수 |
| R-4 | 채팅 단독 | 탭바 자체를 숨길지 1탭으로 그릴지 — **구현 시 결정, TCR에 기록** |
| R-5 | 위치 = 하단 | 아이콘+라벨 탭바, 본문 높이 정상, safe-area 반영 |
| R-6 | 마지막 탭 해제 시도 | 콘솔에서 차단 + 서버 400 |
| R-7 | 설정 변경 후 기존 세션 | 다음 `session/ensure`에서 반영, 활성 탭 폴백 |
| R-8 | 3탭 × 6개 언어 라벨 | 넘침 없음 |
| R-9 | a11y | 상/하단 모두 `tablist/tab/tabpanel` + `aria-controls` |

---

## 8. 승인 요청

**이 계획의 승인 전에는 구현에 착수하지 않습니다** (CLAUDE.md §7).

특히 확인이 필요한 지점:
- **R-4** — 탭이 1개만 켜졌을 때 탭바를 아예 숨기는 게 맞는지(그 편이 깔끔하지만, 하나뿐인 탭 이름도 사라짐).
- **§2.1** — `widget_tabs`를 NULL 허용 json으로 두는 방식(백필 회피 목적)에 이견이 없는지.
- **REQ Q6/Q7 가정** — 설정 권한을 테넌트 단일 계층으로, 기본값을 현행 유지로 둔 판단.
