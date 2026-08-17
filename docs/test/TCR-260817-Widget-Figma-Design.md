# TCR-260817-Widget-Figma-Design

Figma Master Shots 적용(PLN-260817)의 테스트 케이스와 검증 결과.

- 작성일: 2026-08-17
- 선행: `docs/analysis/REQ-260817-Widget-Figma-Design.md`, `docs/plan/PLN-260817-Widget-Figma-Design.md`

## 1. 단위 테스트 (자동)

| # | 케이스 | 파일 | 결과 |
|---|---|---|---|
| U-1 | `toListItem`이 `firstItemTitle`을 count와 함께 싣는다 | `order.mapper.spec.ts` | ✅ |
| U-2 | 품목 0건 주문은 `firstItemTitle: null`, 크래시 없음 | `order.mapper.spec.ts` | ✅ |
| U-3 | `notify`가 모든 채널 행에 `refType`/`refId`를 저장한다 | `notification.service.spec.ts` | ✅ |
| U-4 | 참조를 지정하지 않은 발행자는 두 컬럼 모두 null | `notification.service.spec.ts` | ✅ |
| U-5 | `requestReview`가 `refType:'order_item'`/`refId`로 발행한다 | `review.service.spec.ts` | ✅ |
| U-6 | `requestReview`가 무시되는 필드(`orderItemId`)로 몰래 보내지 않는다 — **원 결함의 회귀 가드** | `review.service.spec.ts` | ✅ |

전체 스위트: **1,273 + 93 통과 / 실패 0** (`npm test`).
> ⚠️ 착수 시점에 `heic-conversion.spec.ts` 3건이 실패했으나 **본 변경과 무관** —
> rebase로 들어온 PR #293의 `libheif-js` 의존성이 워크트리에 미설치된 상태였다.
> `npm install` 후 15/15 통과.

## 2. 게이트

| 게이트 | 명령 | 결과 |
|---|---|---|
| 타입체크 | `npx turbo run typecheck` | ✅ 9/9 |
| 빌드 | `npx turbo run build` | ✅ 6/6 |
| i18n 완전성 | `npm run i18n:check` | ✅ es/ko/vi/ja/zh **complete** |
| API 실부팅 (엔티티 변경 필수 게이트) | `node dist/main.js` | ✅ `Nest application successfully started` |
| 스키마 반영 | `SHOW COLUMNS FROM notifications LIKE 'ref%'` | ✅ `ref_type varchar(24)`, `ref_id bigint` |

## 3. 통합 시나리오 (로컬 실행 검증 — 2026-08-17)

환경: MySQL :3316 / API :3000 / 위젯 :5174, tenant 1, 브라우저 실사용.

| # | 시나리오 | 기대 | 결과 |
|---|---|---|---|
| S-1 | 위젯 오픈 | 흰 헤더 + 볼드 타이틀(테넌트 displayName) + 언어/기어/닫기, 상단 2탭, 하단 탭바 없음 | ✅ |
| S-2 | 챗 최초 진입 | 회색 봇 말풍선(균일 라운드, 아바타·타임스탬프 없음) + 연파랑 퀵액션 칩 2열 + pill 입력 + 원형 전송 | ✅ |
| S-3 | `My Orders` 클릭 | **탭 전환 없이** 스레드 안에 리드인 말풍선 + 인라인 주문 카드 | ✅ 프레임 57과 일치 |
| S-4 | 알림 탭 · `전체` | 타입 아이콘(주문=회색박스 / 캠페인=핑크 스파클) · 날짜 밴드 · 상대시각 · 우측 미읽음 점 · 최신 미읽음 1행만 크림 강조 | ✅ |
| S-5 | 알림 탭 · `배송` | 주문번호 + 상태배지 + `품목명 + N개 더` + **가로 4단 스테퍼** + 상태 문구 + 전폭 CTA | ✅ |
| S-6 | 스테퍼 원 내부 | 아이콘과 단계 숫자가 **나란히** 중앙 정렬, 완료 최종단계는 체크 | ✅ (1차 구현은 숫자가 원 경계에 걸쳐 수정) |
| S-7 | 알림 탭 · `리뷰` | 보라 `Review` 배지 + `⭐ 리뷰 작성` CTA | ✅ |
| S-8 | `⭐ 리뷰 작성` 클릭 | 해당 `order_item`으로 `ReviewForm` 오픈 | ✅ **S5 체인 종단 검증** |
| S-9 | 레거시 `?reopen=orders` | 알림 탭 + `배송` 칩 선택 상태로 착지 (SI-1) | ✅ |
| S-10 | 미인증 상태 알림 탭 | `AuthGate`(신원 확인 / 게스트 주문 조회) 표시 | ✅ |
| S-11 | 게스트 조회 실패 | 사유가 명시된 에러 문구 표시(무응답 아님) | ✅ |
| S-12 | 언어 전환 KO | `알림/채팅`, `전체·결제·배송·이벤트·리뷰·문의`, `오늘 받은 알림`, `1분 전`, `⭐ 리뷰 작성` — **디자인 문구와 일치** | ✅ |
| S-13 | 언어 피커 | 6개 언어(English/Español/한국어/Tiếng Việt/日本語/简体中文) 노출 | ✅ |
| S-14 | 콘솔 에러 | 없음 (i18next missingKey 포함) | ✅ |
| S-15 | 배송건 없음 | `진행 중인 배송이 없습니다.` 빈 상태 (30일 윈도우 밖 주문은 제외 — 기존 동작) | ✅ |

### 3.1 재현용 픽스처
S-5~S-8은 시드에 최근 주문·리뷰 알림이 없어 로컬에 임시 데이터를 넣어 검증했고,
**검증 후 전량 삭제**했다(orders_cache 3건 / notifications 52건으로 원복 확인).
재현 시 필요한 것: 30일 이내 `ordered_at`을 가진 주문 2건(배송중/배송완료) + `order_items`,
그리고 `ref_type='order_item'`인 `category='review'` 알림 1건.

## 4. 엣지 케이스

| # | 케이스 | 처리 |
|---|---|---|
| E-1 | `refId`가 없는 **기존** 리뷰 알림 | CTA 미표시(정상 폴백). 백필하지 않음 |
| E-2 | 품목이 캐시되지 않은 주문 | `firstItemTitle: null` → `{{count}}개 상품`으로 폴백 |
| E-3 | `steps[]` 길이가 4가 아닌 추적 | 스테퍼가 배열 길이를 따름(디자인의 4단 하드코딩 아님) |
| E-4 | 추적 응답 지연 | 카드별 스피너, 나머지 카드는 정상 렌더 |
| E-5 | 배송 주문 5건 초과 | 상한 5건 + `더 보기` → 몰 마이페이지 |
| E-6 | 미읽음 0건 | 크림 강조 행 없음 |
| E-7 | 장문 라벨(en/es) | 시나리오 서브메뉴 칩이 `flex-wrap`으로 줄바꿈 |
| E-8 | 상태배지 문자열이 미지의 값 | `toneForStatus` 기본 톤(gray) |

## 5. 미검증 — 잔여

| # | 항목 | 사유 |
|---|---|---|
| R-1 | **모바일 전체화면 바텀시트** | 브라우저 창 리사이즈가 최소폭에 걸려 `sm:` 미만 렌더를 재현하지 못함. 실기기/DevTools 디바이스 모드 확인 필요 |
| R-2 | **임베드 iframe 폭** (`embed.js` 420→444px, SI-6) | 실 스토어프론트 임베드에서만 재현. 배포 후 캐시 만료 포함 확인 필요 |
| R-3 | es/vi/ja/zh 실 렌더 | 키 완전성은 게이트 통과, 육안 확인은 en/ko만 수행 |
| R-4 | 배송완료 주문의 스테퍼가 `preparing`으로 표시 | `fulfillments` 행이 없으면 추적이 stepIndex 0을 반환하는 **기존 백엔드 동작**. 실 이행 데이터가 있는 스테이징에서 재확인 |
| R-5 | 스테이징 배포 후 회귀 | 첨부·동의·이관·종료/CSAT 전 경로 |
