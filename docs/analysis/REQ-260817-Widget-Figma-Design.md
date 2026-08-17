# REQ-260817-Widget-Figma-Design

채팅 위젯(`apps/widget`)에 **Figma "TalkTalk" 파일의 Master Shots 디자인**을 적용하기 위한 요구사항 분석.

- 작성일: 2026-08-17
- 원 요구: "채팅위젯 디자인은 위 피그마 디자인을 적용해야한다. Master Shots 참조"
- 디자인 원본: `https://www.figma.com/design/Y3ql0jG7uicOMDCfQS5ApB/TalkTalk` (FILE_KEY `Y3ql0jG7uicOMDCfQS5ApB`)
- 로컬 반출본: `design/screens/*.png` (`figma_export.py`, PNG @1x, 71 프레임), 컨택트시트 `design/_contact_sheet.png`

---

## 0. 대상 프레임 식별 — "Master Shots"가 어디인가

`figma_export.py`가 만든 파일명은 `{index}_{frameName}.png` 형식으로, **페이지 이름이 빠져 있다**
(스크립트 본문 `figma_export.py:100`은 `{idx}_{page}_{name}` 을 쓰지만, 현재 `design/screens/`에
있는 산출물은 페이지 없이 저장된 **이전 버전**의 결과다). `FIGMA_TOKEN`이 환경에 없어 페이지명을
포함해 재반출할 수도 없다.

프레임 폭과 이름으로 페이지 경계를 역추정하면 다음과 같다.

| 구간 | 폭 | 프레임 성격 | 판정 |
|---|---|---|---|
| 01–07 | 404 / 420 | `Container` — `Hi, Kim` 헤더, 칩이 `결제내역/배송현황/문의하기` | 구(舊) 초안 |
| 08–18 | 1551 / 420 / 404 | `TalkTalk`, `OrderDetails`, `NotificationCenter`, `Feat`, `draft` | 혼재 초안 |
| 19–30 | 1551 | `Admin Dashboard Design`, `Button` | 콘솔(본 요구 범위 밖) |
| 31–33 | 1998 / 7677×7 | `Cover 1`, `Cover 2`, **`Flow Title Bar`** | 페이지 표지 + 플로우 타이틀 바 |
| **34–69** | **404 (+컴포넌트 365/320/270)** | `01.TalkTalk Main` ~ `13_Chat _ Affiliate`, `Types`, `BotBubble`, `OrdersPanel` | **Master Shots 후보** |
| 70–71 | 1551 | `Admin Dashboard Design` | 콘솔(범위 밖) |

근거: (a) 34–69만 **404px 고정폭**의 위젯 패널 프레임으로 일관되고, (b) 프레임 이름이
`01.` `02.` `05.` `09_` `10_` `11_` `12_` `13_` 로 **번호 매겨진 단일 시퀀스**를 이루며,
(c) 바로 앞 33번이 `Flow Title Bar`(폭 7677px, 높이 7px — 페이지 상단 플로우 구분선)라
페이지 시작 지점으로 읽힌다. (d) 01–07의 구 초안과 칩 구성·헤더가 다르고, 34–69 쪽이
최신 정합성을 갖는다.

> **확인 필요 (Q1)**: 위 34–69 구간이 실제 "Master Shots" 페이지가 맞는지. 아니라면
> `FIGMA_TOKEN`을 주시면 페이지명 포함으로 재반출해 정확히 특정한다.

### 0.1 Master Shots 프레임 목록 (중복 변형 접음)

| 파일 | 화면 | 비고 |
|---|---|---|
| `34_01.TalkTalk Main.png` (=40~45) | 알림 탭 · 필터 `전체` | 첫 행 하이라이트(신규) 상태 |
| `35_02_TalkTalk Main.png` (=36~39) | 알림 탭 · 전 행 미읽음 | 읽음/미읽음 변형 |
| `48_02.Pamyent (1).png` | 알림 탭 · 필터 `결제` | |
| `49_OrdersPanel.png` (=50~52) | 알림 탭 · 필터 `배송` | **가로 배송 스테퍼** |
| `52_OrdersPanel.png` | 알림 탭 · 필터 `이벤트` | |
| `64_05.Review.png` | 알림 탭 · 필터 `리뷰` | |
| `53_Container.png` (=55) | 챗 탭 · 최초 인사만 | 빈 상태 |
| `56_Container.png` | 챗 탭 · 봇 아바타 있는 변형 | |
| `57_09_Chat _ My Orders.png` (=58,59) | 챗 · My Orders 플로우 | 인라인 주문 카드 |
| `60_10_Chat _ Product Help.png` | 챗 · Product Help 플로우 | 2단 퀵리플라이 |
| `61_11_Chat _ Contact Support.png` | 챗 · Contact Support 플로우 | 연락 수단 카드 3종 |
| `62_12_Chat _ Affiliate.png` / `65_13_...`(=66) | 챗 · Affiliate 플로우 | 단계 카드 3종 |
| `67_13_Chat _ Affiliate.png` (=68) | 챗 · CSAT 카드 | 이모지 4단 만족도 |
| `69_13_Chat _ Affiliate.png` | 챗 · 상담 종료 확인 | 체크 아이콘 종료 블록 |
| `46_Types.png` | 컴포넌트 — 알림 행 4종 | |
| `47_Container.png` | 컴포넌트 — 알림 행 1종(하이라이트) | |
| `54_Container.png` | 컴포넌트 — 퀵액션 칩 4종 | 연파랑 pill |
| `63_BotBubble.png` | 컴포넌트 — 봇 말풍선 | |

---

## 1. AS-IS

### 1.1 위젯 셸 구조

| 축 | 현황 | 근거 |
|---|---|---|
| 패널 크기 | 데스크톱 `380×600`, 모바일 전체화면 바텀시트 | `apps/widget/src/components/widget/WidgetPanel.tsx:47` |
| 헤더 | **primary-500 배경 컬러 바** + 흰 텍스트, 표시명 + 언어 스위처 + 설정 + 닫기(X) | `WidgetPanel.tsx:55-78` |
| 탭 | **하단 3탭 바** (알림/챗/주문), 아이콘+라벨 세로 배치, 미읽음 배지는 알림 아이콘에만 | `apps/widget/src/components/widget/TabBar.tsx:29-53` |
| 런처 | 우하단 `56×56` 원형 primary-500 + 말풍선 아이콘 | `apps/widget/src/components/widget/Widget.tsx:73` |
| 탭 유지 | 방문한 탭은 언마운트하지 않고 `hidden` 처리 | `WidgetPanel.tsx:85-110` |

### 1.2 디자인 토큰

| 토큰 | 현재 값 | 근거 |
|---|---|---|
| primary-500 | `#6366F1` (인디고) | `apps/widget/tailwind.config.js` |
| primary-600 | `#4F46E5` | 동상 |
| success / warning / error / info | `#10B981` / `#F59E0B` / `#EF4444` / `#3B82F6` | 동상 |
| gray 스케일 | Tailwind v3 기본값 | 동상 |
| 폰트 | Pretendard → system stack | `apps/widget/src/index.css` |
| 테넌트별 색상 | **없음** — `WidgetCopy`는 `displayName`/`firstVisit`/`loginGreeting`만 | `packages/types/src/api/widget.types.ts:33-40` |

> 색상이 테넌트 설정값이 아니라 **빌드타임 상수**이므로, 팔레트 교체는 멀티테넌시 충돌 없이
> 토큰 레벨에서 한 번에 가능하다.

### 1.3 알림 탭

| 축 | 현황 | 근거 |
|---|---|---|
| 필터 칩 | 5종 `all/payment/shipping/event/review`, 활성 = `bg-primary-500 text-white`, 비활성 = `bg-gray-100`, 라운드 `rounded-lg` | `NotificationsTab.tsx:16-22,104-118` |
| 날짜 그룹 | `groupByDate()` 결과를 `text-[11px] text-gray-400` 한 줄로 표시, **배경 없음** | `NotificationsTab.tsx:133-137` |
| 행 레이아웃 | `[미읽음 점] [제목 … 시각] [본문 2줄] [상태 배지]` — **좌측 타입 아이콘 없음** | `NotificationsTab.tsx:32-62` |
| 미읽음 표시 | 좌측 2px 점 `bg-primary-500` | `NotificationsTab.tsx:37-41` |
| 배송 추적 | 알림 탭에 **없음**. 주문 탭 상세의 세로 스테퍼로만 존재 | `apps/widget/src/components/orders/TrackingStepper.tsx:26-53` |

### 1.4 챗 탭

| 축 | 현황 | 근거 |
|---|---|---|
| 상단 | AI 고지 바(`Sparkles` + 문구 + 상담종료 링크) | `ChatTab.tsx:314-325` |
| 말풍선 | 내 것 `bg-primary-500` 흰 글씨 `rounded-lg rounded-br-none`, 봇 `bg-gray-100` | `MessageBubble.tsx:32-37` |
| 아바타 | **없음** | `MessageBubble.tsx` 전체 |
| 시각 표시 | 모든 말풍선 하단에 `text-[10px]` 시각 | `MessageBubble.tsx:74-80` |
| 시나리오 메뉴 | **2열 그리드 카드 버튼**(아이콘+라벨, 사각 테두리) | `ScenarioMenu.tsx:68-79` |
| 퀵리플라이 | `rounded-full border-primary-300 bg-white text-primary-600` pill | `ChatTab.tsx:375` |
| 폴백 액션 | `rounded-full border-gray-200 … text-gray-600` pill | `ChatTab.tsx:444` |
| 입력 | 클립 버튼 + `rounded-lg` 입력창 + **사각 라운드** 전송 버튼 | `ChatTab.tsx:561-583` |
| 인라인 카드 | `ContactCard` / `AffiliateCard` / `CsatCard` / `AuthGate` / `ContactEmailCard` 존재 | `ChatTab.tsx:452-476` |
| 종료 표시 | 좌우 실선 사이 텍스트 divider | `ChatTab.tsx:422-428` |

### 1.5 주문 탭

3개 서브탭(`payments`/`shipping`/`inquiries`) + 목록 + 상세(`OrderDetailView`) + 세로 스테퍼.
근거: `apps/widget/src/components/orders/OrdersTab.tsx:18-33`.

---

## 2. TO-BE — Master Shots가 규정하는 것

### 2.1 셸

- 패널 폭 **404px** (현재 380px).
- 헤더가 **흰 배경 + 진한 볼드 타이틀**(`알림센터`)로 바뀌고, 우측에 **설정 기어 아이콘 하나만** 남는다.
  → 컬러 헤더 바 소멸. **닫기(X)·언어 스위처는 디자인에 없다.**
- 탭이 **상단 세그먼트 2탭**으로 이동. 활성 탭 = 검정 볼드 + 하단 2px 인디케이터, 비활성 = 회색.
  각 탭 라벨 오른쪽에 **원형 카운트 배지**(`#FF385C`).
  - 프레임에 따라 두 번째 탭이 `Chat`(34, 52, 57~69) 또는 `Orders`(48, 49)로 **엇갈린다.** → Q2

### 2.2 디자인 토큰 (프레임 픽셀 샘플링 값)

| 역할 | 값 | 출처 프레임 |
|---|---|---|
| 액션/브랜드 블루 (유저 말풍선, 전송 버튼, 스테퍼 원) | `#2B7FFF` | 57, 49 |
| 진한 블루 (연파랑 칩 텍스트) | `#1447E6` | 54 |
| 연파랑 칩 배경 | `#DBEAFE` | 54 |
| 단계 카드 배경 (Affiliate) | `#EFF3FF` | 65 |
| 성공/Confirmed | `#00C950` | 34 |
| 리뷰/Review | `#AD46FF` | 57 |
| 배송중/In Transit | `#FF6900` | 49 |
| 미읽음 점 · 탭 배지 | `#FF385C` | 34 |
| 봇 말풍선 / 비활성 칩 | `#F3F4F6` | 57, 34 |
| 날짜 그룹 헤더 배경 | `#F9FAFB` | 34 |
| 신규 알림 하이라이트 행 배경 | `#FEF9F3` (따뜻한 크림) | 34 |
| 활성 필터 칩 | `#000000` 배경 + 흰 글씨 | 34 |
| 패널 배경 | `#FFFFFF` | 53 |

> 팔레트가 **인디고(#6366F1) → 블루(#2B7FFF)** 로 전면 교체된다. 값들이 Tailwind v4 기본
> 팔레트(blue-500/green-500/purple-500/orange-500/blue-100/blue-700)와 일치한다.

### 2.3 알림 탭

- 필터 칩 5종 `전체 / 결제 / 배송 / 이벤트 / 리뷰` — **완전 pill**(`rounded-full`),
  활성은 **검정 배경**(현재는 primary 배경).
- 날짜 그룹 헤더가 **회색 배경 띠**(`오늘 받은 알림` / `어제 알림`).
- 행 = `[원형 타입 아이콘] [주문번호 + 상태 배지] [본문] [상대시각]` + 우상단 **미읽음 점**.
  타입 아이콘 3종 확인: 주문(회색 박스), 쿠폰(남색 원 + 선물), 프로모션(핑크 원 + 스파클).
  프로모션 행은 주문번호 대신 **캠페인명 볼드**(`Mad Shade`).
- 신규 행은 **크림색 배경 + 아이콘 배경도 크림**으로 강조.
- 리뷰 행은 본문 아래 **`⭐ 리뷰 쓰기` 인라인 링크**.
- **`배송` 필터가 배송 추적 화면이 된다**: 주문번호 + 우측 상태 배지 + 품목명 +
  **가로 4단계 스테퍼**(번호가 찍힌 원 + 연결선, 완료는 체크 원) + 상태 문구 +
  전폭 아웃라인 버튼(`배송조회` / `Track Order`). 진행중 건은 문구가 **주황 볼드**.

### 2.4 챗 탭

- 상단 AI 고지 바가 **없다**. 탭 바로 아래 첫 봇 말풍선.
- 말풍선: 봇 = `#F3F4F6` 회색 / 좌측, 유저 = `#2B7FFF` / 우측 흰 글씨.
  **모서리가 4방향 균일 라운드**(현재의 꼬리형 `rounded-bl-none` 아님).
  **타임스탬프 없음.** 변형 프레임(56)에는 봇 아바타 원이 붙는다.
- 인라인 주문 카드: 흰 배경 + 회색 테두리 + `주문번호 + 배지` / `품목 · 금액`.
- 퀵리플라이 = **작은 흰 pill + 회색 테두리**(`배송 조회` `주문 취소` `처음으로`).
  종료용 `종료` 칩만 **파란 테두리**로 구분.
- 퀵액션 칩(컴포넌트 54) = **연파랑 배경 pill + 파란 글씨**, 2열 배치.
- Product Help: 옵션 pill들이 **다중 행 wrap**, 선택된 것만 파란 테두리.
- Contact Support: **연락 수단 카드 3종**(전화/이메일/채팅) — 각 카드에 아이콘+제목,
  운영시간 회색 소문자, 파란 링크 값.
- Affiliate: **단계 카드 3종**(연파랑 `#EFF3FF`, 좌측 들여쓰기, 제목 볼드 + 설명 회색).
- CSAT: **파란 테두리 카드 + 이모지 4단**(불만족/보통/만족/매우 만족) + `건너뛰기`.
- 종료: **연녹색 원 + 체크 아이콘**, `상담이 종료되었습니다` 볼드 + 안내 회색.
- 입력창: **완전 pill**(`rounded-full`) + placeholder `Ask Anything` +
  **원형 파란 전송 버튼**(종이비행기). **클립(첨부) 버튼이 디자인에 없다.**

---

## 3. 갭 분석

| # | 항목 | AS-IS | TO-BE | 성격 | 난이도 |
|---|---|---|---|---|---|
| G-01 | 팔레트 | 인디고 `#6366F1` | 블루 `#2B7FFF` 계열 | 토큰 교체 | 낮음 |
| G-02 | 헤더 | 컬러 바 + 표시명 + 언어 + 설정 + X | 흰 배경 + 볼드 타이틀 + 기어만 | 구조 | 낮음 |
| G-03 | 탭 위치 | 하단 3탭(아이콘) | 상단 2탭 세그먼트(텍스트+배지) | **IA 변경** | 중간 |
| G-04 | 탭 배지 | 알림 아이콘에만 | 각 탭 라벨 우측 | 구조 | 낮음 |
| G-05 | 필터 칩 | `rounded-lg`, 활성 primary | `rounded-full`, 활성 검정 | 스타일 | 낮음 |
| G-06 | 날짜 그룹 | 텍스트만 | 회색 배경 띠 | 스타일 | 낮음 |
| G-07 | 알림 행 | 아이콘 없음, 좌측 점 | 원형 타입 아이콘 + 우상단 점 | 구조 | 중간 |
| G-08 | 알림 타입 아이콘 | **데이터 없음** | 주문/쿠폰/프로모션 3종 분기 | **데이터 갭** | 중간 |
| G-09 | 신규 행 하이라이트 | 없음 | 크림 배경 강조 | 스타일 + 규칙 정의 | 낮음 |
| G-10 | 리뷰 행 CTA | 없음 | `⭐ 리뷰 쓰기` 인라인 | **기능 추가** | 중간 |
| G-11 | 배송 스테퍼 | 주문 탭 상세, 세로 | 알림 `배송` 필터, **가로 4단** | **구조 + 배치 이동** | 높음 |
| G-12 | 배송 CTA | 없음 | 전폭 `배송조회` 버튼 | 기능 추가 | 중간 |
| G-13 | AI 고지 바 | 있음 | 디자인에 없음 | **정책 충돌** → Q3 | — |
| G-14 | 말풍선 꼬리 | 꼬리형 | 균일 라운드 | 스타일 | 낮음 |
| G-15 | 타임스탬프 | 모든 말풍선 | 없음 | 스타일(정보 손실) → Q3 | 낮음 |
| G-16 | 봇 아바타 | 없음 | 변형 프레임에 있음 | 스타일(선택) → Q4 | 낮음 |
| G-17 | 시나리오 메뉴 | 2열 사각 카드 + 아이콘 | 연파랑 pill 2열 | 스타일 | 낮음 |
| G-18 | Contact 카드 | `ContactCard` 존재(형태 상이) | 3종 수단 카드 | 스타일 재작업 | 중간 |
| G-19 | Affiliate 카드 | `AffiliateCard` 존재(형태 상이) | 연파랑 단계 카드 3종 | 스타일 재작업 | 중간 |
| G-20 | CSAT | `CsatCard` 존재(형태 미상) | 파란 테두리 + 이모지 4단 | 스타일 재작업 | 낮음 |
| G-21 | 종료 표시 | 텍스트 divider | 체크 원 + 볼드 문구 블록 | 스타일 | 낮음 |
| G-22 | 입력창 | 사각 라운드 + 클립 | pill + 원형 전송, 클립 없음 | 스타일 + **기능 충돌** → Q5 | 낮음 |
| G-23 | 패널 폭 | 380px | 404px | 수치 | 낮음 |
| G-24 | 언어 스위처 | 헤더에 있음 | 디자인에 없음 | **기능 충돌** → Q3 | 낮음 |
| G-25 | 닫기(X) | 헤더에 있음 | 디자인에 없음 | **UX 충돌** → Q3 | 낮음 |

---

## 4. 사용자 플로우 (Master Shots 기준)

```
런처 클릭
  └─ 패널 오픈 → [알림센터] 헤더 / 상단 2탭
       ├─ Notifications 탭 (기본)
       │    ├─ 전체 : 주문·쿠폰·프로모션·리뷰 혼합 목록, 신규 크림 강조
       │    ├─ 결제 : 주문 상태 배지(Confirmed / In Transit) 목록
       │    ├─ 배송 : 가로 4단 스테퍼 + [배송조회] CTA
       │    ├─ 이벤트 : 쿠폰/프로모션 카드
       │    └─ 리뷰 : Review 배지 + [⭐ 리뷰 쓰기]
       └─ Chat 탭
            ├─ 인사 말풍선
            ├─ 퀵액션 pill (My Orders / Product Help / Contact Support / Affiliate)
            ├─ My Orders      → 인라인 주문 카드 → 퀵리플라이(배송조회/주문취소/처음으로)
            ├─ Product Help   → 옵션 pill → 답변 → 퀵리플라이
            ├─ Contact Support→ 연락 수단 카드 3종 → [처음으로]
            └─ Affiliate      → 단계 카드 3종 → 퀵리플라이 + [종료]
                                  └─ [종료] → CSAT 이모지 카드 → 종료 확인 블록
```

---

## 5. 제약 조건

1. **멀티테넌시** — 디자인 카피가 `IVY Beauty`, `알림센터`, `1588-0000`, `help@ivy.com` 등
   IVY 고정값이다. 현재 위젯은 이 값들을 `widgetCopy.displayName` / `t()` / 테넌트 설정에서
   가져오도록 이미 고쳐놓은 상태다(PLN-260808에서 하드코딩 결함을 제거한 이력). **디자인의
   문구를 그대로 박으면 그 수정이 되돌아간다.** 형태만 적용하고 값은 기존 소스를 유지해야 한다.
2. **i18n** — 디자인은 한국어 단일 언어다. `t()` 경유 원칙(CLAUDE.md §2) 및 en/es/ko 3개국어
   유지. 한국어 기준으로 잡힌 pill 폭이 영어·스페인어에서 넘칠 수 있다(예: `Contact Support`).
3. **모더레이션·개인정보 UI 불가침** — `ConsentBanner`, `AuthGate`, `ContactEmailCard`는
   디자인에 등장하지 않지만 정책상 제거 불가(FR-069/POL-020, CCPA/GDPR).
4. **첨부 기능** — 2026-08-14 배포된 첨부 파이프라인(PR #287/#288)의 클립 버튼·업로드 트레이가
   디자인에 없다. 제거 시 배포된 기능의 진입점이 사라진다.
5. **반응형** — 디자인은 404px 고정 1종. 현재 위젯은 모바일 전체화면 바텀시트 + 데스크톱 카드
   2종을 지원하며, `embed.js`가 iframe 크기를 `ivy:resize`로 조정한다(`Widget.tsx:43-46`).
   404px 고정으로 회귀시키면 모바일이 깨진다.
6. **접근성** — 현재 `role="dialog"`, `aria-live` 스레드, 포커스 링, Esc 닫기가 구현되어 있다.
   헤더 X 제거(G-25) 시 Esc 외에 닫는 수단이 사라진다.
7. **백엔드 무변경 지향** — G-08(알림 타입), G-10(리뷰 쓰기), G-11/12(알림 탭 배송 추적)는
   현재 알림 API 응답에 없는 필드를 요구할 가능성이 크다. 스키마 변경이 필요하면
   마이그레이션 선적용 규칙(CLAUDE.md §7)이 걸린다.

---

## 6. 확정 사항 (사용자 결정 2026-08-17)

| # | 질문 | **결정** |
|---|---|---|
| **Q1** | Master Shots 구간 | **반출본 34–69로 확정.** §0.1 목록대로 진행 |
| **Q2** | 상단 탭 2탭 / 3탭 | **상단 2탭 `Notifications \| Chat`.** 주문 탭 소멸 → 목록·상세·리뷰를 알림 탭 필터와 챗 인라인 카드로 재배치 |
| **Q3/Q5** | 디자인에 없는 기존 요소 | **AI 고지 바 · 헤더 닫기(X) · 언어 스위처 · 첨부(클립) 버튼 모두 유지.** 디자인에 대한 명시적 편차로 기록 |
| **Q4** | 봇 아바타 | Q3에서 미선택 → **표시하지 않음**(프레임 53/55/57의 아바타 없는 변형 채택) |
| **Q6** | 범위 | **리스킨 + 기능 추가 전부.** G-08/G-10/G-11/G-12 포함 |
| **Q7** | 반응형 | 미질의 → **기존 유지 가정**: 모바일 전체화면 바텀시트 존치, 데스크톱 카드 폭만 380→404px |

### 6.1 결정 후 추가 확인한 설계 사실

| 항목 | 사실 | 영향 |
|---|---|---|
| 알림 타입 아이콘(G-08) | `NotificationResponse.category`가 **이미 존재**(`payment`/`shipping`/`event`/`review`/`chat`) — `widget.types.ts:240` | **백엔드 무변경.** 아이콘 = f(category) 클라이언트 매핑으로 해결 |
| 배송 추적(G-11) | 추적이 **주문당 별도 엔드포인트** `GET /orders/:id/tracking` — `order.controller.ts:40` | 목록 렌더 시 N+1 팬아웃 → 건수 상한 필요 |
| 추적 데이터 | `TrackingResponse.steps[]`(서버 현지화 라벨) + `stepIndex` — `widget.types.ts:229-235` | 가로 4단 스테퍼에 **충분**, 신규 필드 불필요 |
| 리뷰 CTA(G-10) | 알림 행에 `orderId`가 없고 `linkUrl`만 있음 | 기존 `ReviewForm` 연결에 **식별자 확보 방안 필요** |
| 주문 탭 결합점 | `TabKey`(`widgetStore.ts:6`), `setActiveTab('orders')` 3곳(`ChatTab.tsx:192,222,263`), `?reopen=orders`(`Widget.tsx:34`) | 2탭 전환 시 전부 재배선 |
| 문의(inquiries) | `listIssues` 피드가 주문 탭 서브탭에만 존재. **디자인의 5개 칩에 자리가 없음** | 별도 배치 결정 필요 |

---

## 7. 다음 단계

`docs/plan/PLN-260817-Widget-Figma-Design.md` — ASCII 와이어프레임 포함,
단계별 구현 계획 및 사이드 임팩트 분석. **PLN 승인 전 구현 착수 금지.**
