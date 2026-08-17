# RPT-260817-Widget-Tab-Config

주문 탭 복원 + 탭 구성/위치의 테넌트별 설정화 구현 보고.

- 작성일: 2026-08-17
- 문서 체인: `REQ-260817-Widget-Tab-Config` → `PLN-260817-Widget-Tab-Config` → 구현 → `TCR-260817-Widget-Tab-Config` → 본 문서
- 기반: PR #301(`0178e83`) 스테이징 LIVE
- PR: _(작성 시점 미생성)_ · 배포: **미배포**

## 1. 무엇이 바뀌었나

테넌트가 **어떤 탭을 보여줄지**와 **탭바가 어디에 있을지**를 콘솔에서 고른다.

1. `tenants.widget_tabs`(json, NULL 허용) + `widget_tab_position`(varchar, 기본 `top`) 추가.
2. 주문 탭 부활 — 단, PR #301 이전 구현의 복원이 아니라 **공유 목록 탭의 얇은 껍데기**.
3. 칩 이관 — 주문 탭이 켜지면 `결제·배송·리뷰·문의`가 그쪽으로, 알림 탭엔 `전체·이벤트`만.
4. 하단 탭바 신설(아이콘+라벨) — 상단은 라벨 세그먼트 유지.
5. **미설정 테넌트의 위젯은 오늘과 동일하다.**

## 2. 설계에서 중요한 판단 3가지

### 2.1 `widget_tabs`는 NULL을 남긴다
기본 배열을 전 행에 써 넣지 않았다. NULL = "설정한 적 없음"으로 두면 내장 기본값을 나중에 바꿔도
손대지 않은 테넌트가 자동으로 따라온다. 값을 박으면 **아무도 고르지 않은 오늘의 기본값이 동결**되고,
바꿀 때마다 백필이 한 번씩 더 필요해진다. 백필 없음 = 롤백도 컬럼 DROP 하나로 끝난다.

### 2.2 주문 탭은 재구현이 아니라 재사용이다
`OrdersTab`은 12줄이다. `NotificationsTab`에 `tab="orders"`를 넘길 뿐이고, 배송 스테퍼·이슈 피드·
주문 상세·리뷰 폼은 전부 같은 컴포넌트다. 별도 구현을 세우면 PR #301에서 한 번 겪은 "같은 내용이
두 곳에서 갈라지는" 상태로 곧장 되돌아간다.

### 2.3 칩은 사라지지 않고 흡수된다
세 탭을 각각 끌 수 있으므로 "칩이 갈 곳이 없어지는" 조합이 생긴다. 규칙은 한 줄이다 —
**살아 있는 목록형 탭이 하나뿐이면 그 탭이 상대의 칩까지 가져간다.** 그래서 주문 탭을 꺼도
배송 조회 기능이 조용히 사라지지 않는다(`tabChips.ts`).

## 3. 변경 파일

### 신규
| 파일 | 역할 |
|---|---|
| `sql/migration_widget_tab_config.sql` | 컬럼 2개(객체별 멱등 가드) |
| `packages/types/src/common/widget-tabs.spec.ts` | 정규화 계약 8케이스 |
| `apps/widget/src/lib/widget-tabs.ts` | 소스 딥임포트(브라우저 번들은 `@ivy/types` 값 임포트 불가) |
| `apps/widget/src/components/widget/tabDefs.ts` | 탭 라벨·아이콘 단일 정의 |
| `apps/widget/src/components/widget/useTabBar.ts` | 두 탭바가 공유하는 상태·배지 규칙 |
| `apps/widget/src/components/widget/BottomTabs.tsx` | 하단 아이콘+라벨 탭바 |
| `apps/widget/src/components/notifications/tabChips.ts` | 칩 흡수 규칙 |
| `apps/widget/src/components/orders/OrdersTab.tsx` | 주문 탭(12줄) |

### 수정
`packages/types` (`enum.types` — `WIDGET_TAB`/순서/기본값/위치/`normalizeWidgetTabs`, `widget.types` — SessionResponse) ·
API (`tenant.entity` · `tenant.request` · `tenant.response` · `tenant.service` · `tenant.mapper` ·
`session.service` · `session.mapper`) ·
콘솔 (`settings.service` · `settings.hooks` · `SettingsPage` · `i18n/locales/*/settings.json` 6종) ·
위젯 (`widgetStore` · `useSession` · `TopTabs` · `WidgetPanel` · `Widget` · `NotificationsTab` · `lib/types`)

## 4. 마이그레이션

**파일**: `sql/migration_widget_tab_config.sql`

```sql
ALTER TABLE `tenants`
  ADD COLUMN `widget_tabs` json NULL AFTER `widget_copy`,
  ADD COLUMN `widget_tab_position` varchar(8) NOT NULL DEFAULT 'top' AFTER `widget_tabs`;
```
- 순서: **대상 DB 선적용 → 코드 배포**. 구코드+신컬럼 안전, 신코드+구스키마는 session 매퍼에서 500.
- **백필 없음** (§2.1). 롤백은 컬럼 2개 DROP.
- 멱등: 컬럼별 가드. 로컬 실측 — 재실행 `exit=0`.
- 적용: local ✅ · staging ⬜ · production ⬜

## 5. 테스트 결과

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **16건** (U-1~U-16) |
| 전체 스위트 | **1,287 + 101 통과 / 실패 0** |
| typecheck / build | ✅ 9/9 |
| `npm run i18n:check` | ✅ 5개 언어 complete |
| API 실부팅 | ✅ |
| 로컬 통합 | S-1~S-10 통과 (TCR §3) |

## 6. 구현 중 발견해 고친 결함

**`?reopen` 딥링크가 테넌트 설정보다 먼저 평가됐다.** 마운트 시점의 `visibleTabs`는 아직 시드
기본값이라, 주문 탭을 보여주는 테넌트에서도 `?reopen=orders`가 알림 탭으로 착지했다.
1차 수정(레이아웃 변경 시 재평가)은 **첫 패스에서 의도를 소비**해 보정이 일어나지 않았다.
최종안은 `tabsResolved` 플래그로 **실제 레이아웃 도착 후에만 의도를 소비**한다.
브라우저에서 직접 재현하지 않았다면 두 번 다 놓쳤을 결함이다.

## 7. PLN 대비 결정 확정

| # | 항목 | 확정 |
|---|---|---|
| R-4 | 탭 1개만 노출될 때 | **탭바를 렌더하지 않음.** 선택지 없는 탭 줄은 정보가 없고 패널 제목이 이미 위치를 알려준다 |
| §2.1 | `widget_tabs` NULL 허용 json | 승인대로 채택 |
| Q6/Q7 | 테넌트 단일 계층 · 기본값 현행 유지 | 승인대로 채택 |

## 8. 잔여 / 후속

| # | 항목 | 비고 |
|---|---|---|
| N-1 | **콘솔 설정 카드 육안 미확인** | 로그인에 비밀번호 입력이 필요해 수행하지 않음. 서비스 계층은 U-13~U-16으로 커버되나, 체크박스 비활성화·저장 토스트는 사람 눈으로 봐야 함 |
| N-2 | 하단 탭 + 모바일 safe-area | 실기기 필요 |
| N-3 | 3탭 × es/vi/ja/zh 라벨 넘침 | ko/en만 확인 |
| N-4 | 스테이징 배포 + 회귀 스모크 | 마이그레이션 선적용 필수 |
| N-5 | GA4 `tabView('orders')` 부활 | PR #301에서 사라졌다 돌아옴 — 대시보드 세그먼트 재확인(SI-4) |
