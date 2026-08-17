# RPT-260817-Widget-Figma-Design

Figma "TalkTalk" Master Shots를 채팅 위젯에 적용한 구현 보고.

- 작성일: 2026-08-17
- 문서 체인: `REQ-260817-Widget-Figma-Design` → `PLN-260817-Widget-Figma-Design` → 구현 → `TCR-260817-Widget-Figma-Design` → 본 문서
- 브랜치: `KimIgyong/work-ui` (base `main` @ `049b04f`)
- PR: _(미생성)_ · 배포: **미배포**

## 1. 무엇이 바뀌었나

디자인이 요구한 것은 리스킨만이 아니라 **정보구조 변경**이었다.

1. **팔레트 전면 교체** — 인디고 `#6366F1` → 블루 `#2B7FFF`. 값은 프레임 PNG를 픽셀 샘플링해 확정(눈대중 아님).
2. **하단 3탭 → 상단 2탭** — 주문 탭이 사라지고, 그 기능이 알림 탭 필터와 챗 인라인 카드로 재배치됐다.
3. **알림 행 재설계** — 타입 아이콘, 신규 강조, 날짜 밴드, 상대시각.
4. **`배송` 필터 = 가로 스테퍼 화면** — 세로 스테퍼는 주문 상세에 그대로 남았다.
5. **`⭐ 리뷰 작성`** — 이를 위해 백엔드에 참조 컬럼을 추가했다(§3).

## 2. 변경 파일

### 신규 (위젯)
| 파일 | 역할 |
|---|---|
| `components/widget/TopTabs.tsx` | 상단 2탭 세그먼트 + 탭별 카운트 배지 |
| `components/notifications/NotificationIcon.tsx` | `category` → 원형 타입 아이콘 (G-08) |
| `components/notifications/ShipmentList.tsx` | `배송` 필터 = 주문 기반 배송 카드 목록 |
| `components/orders/TrackingStepperH.tsx` | 가로 4단 스테퍼 (G-11) |
| `components/chat/InlineOrderCard.tsx` | 인라인 주문 카드 + `InlineOrdersAnswer` |

### 삭제
| 파일 | 사유 |
|---|---|
| `components/widget/TabBar.tsx` | 하단 탭바 소멸 |
| `components/orders/OrdersTab.tsx` | 주문 탭 소멸 (내부의 `OrderDetail`/`ReviewForm`/`TrackingStepper`는 재사용되어 **존치**) |

### 수정 (위젯)
`tailwind.config.js`(팔레트) · `WidgetPanel.tsx`(흰 헤더·404px·탭 배치) · `Widget.tsx`(레거시 reopen 매핑) ·
`LanguageSwitcher.tsx`(흰 배경 대응) · `NotificationsTab.tsx`(전면 재작성) · `ChatTab.tsx`(인라인 주문·칩·입력·종료·미읽음 카운터) ·
`MessageBubble.tsx` · `ScenarioMenu.tsx` · `ContactCard.tsx` · `AffiliateCard.tsx` · `CsatCard.tsx` · `Badge.tsx`(솔리드 톤) ·
`OrderDetail.tsx`(주석) · `PreferencesPanel.tsx`(날짜 현지화) · `store/widgetStore.ts` · `lib/format.ts` ·
`public/embed.js` · `i18n/locales/{en,es,ko,vi,ja,zh}.ts`

### 수정 (백엔드 / 계약)
`packages/types/src/api/widget.types.ts` · `notification.entity.ts` · `notification.response.ts`(NotifyInput) ·
`notification.mapper.ts` · `notification.service.ts` · `review.service.ts` · `order.mapper.ts` · `order.service.ts`
`sql/migration_notification_ref.sql` (신규)

36개 파일 변경 + 5개 신규, `+1,010 / −547`.

## 3. 구현 중 드러난 사실 3가지

### 3.1 리뷰 요청의 `orderItemId`는 **원래 버려지고 있었다**
`ReviewService.requestReview`가 이벤트에 `orderItemId`를 실어 보냈지만 `NotifyInput`에 그 필드가 없어
조용히 사라졌다. 타입 에러도, 로그도 없었다. 그래서 알림 행에서 리뷰 폼을 열 식별자가 존재하지 않았다.
→ `notifications.ref_type` / `ref_id` 추가(§4). 회귀 가드로 "무시되는 필드로 보내지 않는다" 테스트를 남겼다.

### 3.2 주문 목록에 품목명이 없었다
`OrderListItemResponse`는 `itemCount`만 실어, 디자인의 `품목명 + N개 더` 줄을 만들 수 없었다.
주문마다 상세를 부르면 PERF-7(카운트를 GROUP BY 한 방으로 바꾼 최적화)이 무너진다.
→ `itemCounts`를 `itemSummaries`로 확장해 **고정 2쿼리**로 첫 품목명까지 집계, `firstItemTitle` 필드 추가.
`GROUP_CONCAT`은 SEPARATOR가 리터럴이어야 해 품목명에 구분자가 들어가면 깨지므로 의도적으로 피했다.

### 3.3 패널 404px는 임베드 iframe을 넘쳤다
`embed.js`의 `OPEN.w`가 `min(420px, 100vw)`인데 패널 404px + `right-5`(20px) = **424px**.
기존 380px에서는 우연히 20px 여유가 있었다. → `min(444px, 100vw)`로 상향.
**`embed.js`는 스토어에 캐시되는 로더**라 배포 후 캐시 만료 확인이 필요하다(TCR R-2).

## 4. 마이그레이션

**파일**: `sql/migration_notification_ref.sql`

```sql
ALTER TABLE `notifications`
  ADD COLUMN `ref_type` varchar(24) NULL AFTER `link_url`,
  ADD COLUMN `ref_id` bigint NULL AFTER `ref_type`;
CREATE INDEX `idx_notif_ref` ON `notifications` (`ref_type`, `ref_id`);
```

- 적용 순서: **대상 DB 선적용 → 코드 배포**. 구코드+신컬럼은 안전, 신코드+구스키마는 insert마다 500.
- 롤백: 인덱스 DROP 후 컬럼 2개 DROP (구코드는 두 컬럼을 읽지 않음).
- **백필 없음** — 기존 리뷰 알림은 `ref_id` NULL이라 CTA가 표시되지 않는다(의도된 폴백).
- 적용 상태: local ✅ (DB_SYNCHRONIZE로 생성 확인) · staging ⬜ · production ⬜

## 4.1 리뷰 반영 (CodeRabbit, 2026-08-17)

`60196ce`에서 8건 수정. 상세는 커밋 메시지 참조.
- **Major**: 버튼 중첩(무효 HTML) · 문의 피드의 오해 유발 빈 상태 · `returnObjects` 캐스트로 인한 배송 필터 전체 다운 가능성
- **Minor**: 인증 후 주문 답변 소실 · CSAT 실패 무표시(dev-kit §4.3 위반) · 터치 기기 타임스탬프 도달 불가 · 마이그레이션 재실행 시 인덱스 누락
- **미반영 2건**: 배지 대비(D-10, 디자인 판단 대기) · 컴포넌트 파일명(레포 기존 PascalCase 규약과 일치)

## 5. 테스트 결과

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | 6건 추가 (U-1~U-6) |
| 전체 스위트 | **1,279 + 93 통과 / 실패 0** |
| typecheck / build | ✅ 9/9, 6/6 |
| `npm run i18n:check` | ✅ 5개 언어 complete |
| API 실부팅 | ✅ `Nest application successfully started` |
| 로컬 통합 시나리오 | S-1~S-15 **전부 통과** (TCR §3) |

## 6. 디자인 대비 편차 (승인 완료 + 구현 중 추가)

| # | 편차 | 상태 |
|---|---|---|
| D-2 | AI 고지 바 · 언어 스위처 · 닫기(X) · 📎 클립 존치 | 사용자 결정 |
| D-3 | 알림 필터 칩 6개(+`문의`) | 사용자 승인 전제(2탭 IA) |
| D-5 | 신규 강조 = 최상단 미읽음 1건 | PLN 승인 |
| D-7 | CSAT **5단** 이모지 (디자인 4단) | **구현 중 판단** — 평점이 1–5로 저장되고 `csat_avg`가 이미 그 척도로 집계 중. 4단은 척도에 구멍을 내거나 과거 평균의 의미를 바꾼다 |
| D-8 | Affiliate 단계 카드 제목만 | **구현 중 판단** — 디자인 설명문이 IVY 고유 조건(`10% 적립`)이라 멀티테넌트 위젯에 넣을 수 없다 |
| D-9 | 타임스탬프 hover 노출 (+ 터치 기기는 상시 노출) | D-1의 구현 형태. 리뷰 지적 반영: hover가 없는 터치 기기에서는 영영 안 보였다 |
| D-10 | **상태 배지 대비 미달을 그대로 둠** | 디자인이 `#00C950` 위 흰 글씨(약 2.2:1)를 쓴다. WCAG AA(4.5:1) 미달이지만, 샘플링한 브랜드 색을 임의로 어둡게 바꾸면 이 PR의 목적 자체가 무너진다. **디자인 소유자 판단 대기** |

## 7. 잔여 / 후속

| # | 항목 | 비고 |
|---|---|---|
| N-1 | **모바일 바텀시트 육안 검증** | 창 리사이즈로 `sm:` 미만을 재현하지 못함. 실기기/디바이스 모드 필요 |
| N-2 | **임베드 iframe 폭** 실측 | 실 스토어프론트 임베드 + 로더 캐시 만료 |
| N-3 | es/vi/ja/zh 육안 렌더 | 키 완전성은 통과, 확인은 en/ko만 |
| N-4 | 배송완료 주문이 스테퍼 `preparing`으로 표시 | `fulfillments` 없으면 stepIndex 0 — **기존 백엔드 동작**. 실 이행 데이터가 있는 스테이징에서 재확인 |
| N-5 | ⚠️ `contact.phone: '1588-0000'` / `contact.email: 'help@ivy.com'`이 **en 번들에 하드코딩** | 본 작업 이전부터 존재. REQ §5-1이 경계한 바로 그 패턴이며, 테넌트 설정으로 옮기는 별도 과제 |
| N-6 | 스테이징 배포 + 회귀 스모크 | 마이그레이션 선적용 필수 |
| N-7 | **배지 대비(D-10) 결론** | 디자인 유지 / 배경 어둡게 / 전경색 tone별 지정 중 택1 필요 |
