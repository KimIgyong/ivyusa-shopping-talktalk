---
doc_id: GTJ-KB-HOTEL-ADMIN
title: Go2Joy 호텔 파트너 어드민 사용 매뉴얼 (Hotel Partner Admin Manual)
version: 1.0
status: draft
last_updated: 2026-08-28
source: Go2Joy Hotel Admin User Guide (원문 영문 매뉴얼)
audience: 호텔 파트너 운영자 / CS 상담원 / RAG 챗봇
language: ko + en
---

# Go2Joy 호텔 파트너 어드민 지식베이스

> **문서 목적**
> 호텔 파트너용 어드민 매뉴얼을 **작업(Task) 단위 KB 아티클**로 재구성한 문서입니다.
> 각 아티클은 독립적으로 검색·인용되도록 작성되어 RAG 임베딩 및 상담 응대에 바로 사용할 수 있습니다.
>
> **아티클 템플릿**: `목적 → 진입 경로 → 절차 → 주의사항 → 관련 항목`
> **아티클 ID 규칙**: `GTJ-{영역코드}-{일련번호}`

---

## 아티클 인덱스 (Article Index)

| ID | 아티클명 (KO) | Article (EN) | 영역 | 상태 |
|---|---|---|---|---|
| GTJ-DSH-01 | 대시보드 조회 | View Dashboard | 대시보드 | 완료 |
| GTJ-REV-01 | 리뷰 답글 등록 | Reply to a Review | 리뷰 관리 | 완료 |
| GTJ-DIS-01 | 직접 할인 프로그램 생성·수정 | Create / Edit a Direct Discount Program | 객실 유형 관리 | 완료 |
| GTJ-DIS-02 | 직접 할인 프로그램 검색 | Search Direct Discount Programs | 객실 유형 관리 | 완료 |
| GTJ-DIS-03 | 직접 할인 프로그램 목록 조회 | View Discount Program List | 객실 유형 관리 | 완료 |
| GTJ-DIS-04 | 직접 할인 프로그램 중지 | Stop a Direct Discount Program | 객실 유형 관리 | 완료 |
| GTJ-FLS-01 | 시간제 플래시 세일 설정 | Set Up Hourly Flash Sale | 객실 유형 관리 | 완료 |
| GTJ-FLS-02 | 오버나이트 플래시 세일 설정 | Set Up Overnight Flash Sale | 객실 유형 관리 | 완료 |
| GTJ-FLS-03 | 플래시 세일 중지 | Stop Flash Sale | 객실 유형 관리 | 완료 |
| GTJ-SUR-01 | 추가 요금 설정 | Set Up Surcharges | 객실 유형 관리 | **보완 필요** |
| GTJ-SUR-02 | 추가 요금 삭제 | Delete Surcharges | 객실 유형 관리 | **보완 필요** |
| GTJ-QLK-01 | 빠른 객실 잠금 설정 | Set Up Quick Room Lock | 객실 유형 관리 | 완료 |
| GTJ-QLK-02 | 빠른 객실 잠금 해제 | Delete Quick Room Lock | 객실 유형 관리 | 완료 |
| GTJ-LCK-01 | 객실 잠금 – 시간제 | Room Lock – Hourly | 객실 유형 관리 | 완료 |
| GTJ-LCK-02 | 객실 잠금 – 일 단위 | Room Lock – By Day | 객실 유형 관리 | 완료 |
| GTJ-LCK-03 | 객실 잠금 – 오버나이트 | Room Lock – Overnight | 객실 유형 관리 | 완료 |
| GTJ-LCK-04 | 객실 잠금 해제 | Delete Room Lock Settings | 객실 유형 관리 | 완료 |
| GTJ-RPT-01 | 특가 객실 리포트 다운로드 | Download Shock-Discount Room Report | 리포트 | **보완 필요** |

---

# 1. 대시보드 (Dashboard)

## GTJ-DSH-01 · 대시보드 조회 (View Dashboard)

**목적 / Purpose**
호텔의 예약량, 운영 성과, 고객 리뷰를 한 화면에서 모니터링한다.
*Monitor booking volume, hotel performance, and customer reviews at a glance.*

**진입 경로 / Path**
`어드민 > 대시보드 (Dashboard)`

**대시보드 구성 / Sections**

### 1) 예약 개요 (Booking Overview)
일자별 예약 현황을 아래 두 기준으로 요약·상세 조회한다.

- **예약 유형별 (Booking Type)** — 시간제(Hourly) / 오버나이트(Overnight) / 일 단위(Daily)
- **예약 상태별 (Booking Status)**

### 2) 호텔 성과 지표 (Hotel Performance)

| 지표 (KO) | Metric (EN) | 정의 |
|---|---|---|
| 방문자 수 | Visitors | 선택 기간 동안 해당 호텔을 방문(조회)한 고객 수 |
| 조회 수 | Views | 해당 호텔 페이지의 방문/조회 횟수 |
| 예약 건수 | Bookings | 성공적으로 완료된 예약 건수 |
| 체크인 건수 | Check-ins | 실제 체크인이 발생한 건수 |
| 순매출 | Net Revenue | 객실 요금 + 추가 요금 − 호텔 프로모션 |
| 수령 결제액 | Payments Received | 완료된 예약에 대해 고객이 실제 결제한 총액 |

> **순매출 계산식 / Formula**
> `Net Revenue = Room Rate + Surcharges − Hotel Promotions`
> (순매출 = 객실 요금 + 추가 요금 − 호텔 프로모션)

### 3) 리뷰 개요 (Reviews Overview)
호텔에 등록된 고객 리뷰의 요약 정보를 표시한다.

**주의사항 / Notes**
- `Visitors`(방문자 수)와 `Views`(조회 수)는 다른 지표다. Visitors는 **고객 수**, Views는 **조회 횟수**다.
- `Net Revenue`(순매출)와 `Payments Received`(수령 결제액)는 산정 기준이 다르므로 정산 문의 시 구분해서 안내한다.

**관련 항목 / Related**
`GTJ-REV-01`

---

# 2. 리뷰 관리 (Review Management)

## GTJ-REV-01 · 리뷰 답글 등록 (Reply to a Review)

**목적 / Purpose**
고객이 남긴 리뷰에 호텔이 답글을 등록한다.

**진입 경로 / Path**
`어드민 > 리뷰 관리 (Review Management)`

**절차 / Steps**

1. 답글을 달 리뷰에서 **[답글 / Reply]** 선택
2. 답글 내용 입력
3. 답글 제출 후 시스템의 **성공 알림** 확인

**주의사항 / Notes**
- ⚠️ **하나의 리뷰(댓글)당 답글은 1회만 등록 가능**하다. *(Only one reply is allowed per comment.)*
- 답글 등록 후 수정·재등록이 불가하므로 제출 전 내용을 반드시 확인한다.

**관련 항목 / Related**
`GTJ-DSH-01` (리뷰 개요)

---

# 3. 객실 유형 관리 (Room Type Management)

## 3.1 직접 할인 설정 (Direct Discount Settings)

### GTJ-DIS-01 · 직접 할인 프로그램 생성·수정 (Create / Edit a Direct Discount Program)

**목적 / Purpose**
지정한 기간 또는 특정일에 적용되는 객실 직접 할인 프로그램을 생성하거나 수정한다.

**진입 경로 / Path**
`어드민 > 객실 유형 관리 > 직접 할인 설정 (Direct Discount Settings)`

**절차 / Steps**

**STEP 1. 기본 정보 입력 (Enter General Information)**

- **프로그램명 (Program name)** — 최대 **100자**
- **적용 기간 (Availability period)** — 다음 두 가지 중 **택 1**
  - 기간 단위 실행 (Run by period)
  - 특정일 실행 (Run on special days)
- **참여 호텔 선택 (Select participating hotels)** — 대상 호텔 선택
- **[계속 / Continue]** 선택

**STEP 2. 할인 설정 (Set up discounts)**

- **개별 객실 설정 (Individual room settings)** — 객실별로 할인을 개별 지정
- **일괄 설정 (Bulk settings)** — 여러 객실에 동일 할인을 한 번에 적용
- **참여 호텔 추가 (Add participating hotels)** — 프로그램에 호텔 추가
- **할인가 수정 (Edit discounted prices)** — 프로그램 설정 완료 후에도 할인가 수정 가능

**주의사항 / Notes**
- 프로그램명은 100자를 초과할 수 없다.
- 적용 기간은 `기간 단위`와 `특정일` 중 하나만 선택 가능하다(동시 선택 불가).
- 프로그램 설정이 완료된 이후에도 **할인가 수정은 가능**하다.

**관련 항목 / Related**
`GTJ-DIS-02`, `GTJ-DIS-03`, `GTJ-DIS-04`

---

### GTJ-DIS-02 · 직접 할인 프로그램 검색 (Search Direct Discount Programs)

**목적 / Purpose**
등록된 직접 할인 프로그램을 이름 또는 상태로 검색한다.

**진입 경로 / Path**
`어드민 > 객실 유형 관리 > 직접 할인 설정 > 목록`

**절차 / Steps**

**A. 프로그램명으로 검색 (Search by name)**
1. 프로그램명 입력
2. **[검색 / Search]** 클릭

**B. 상태로 검색 (Search by Status)**
1. 상태(Status) 선택
2. **[검색 / Search]** 클릭

**관련 항목 / Related**
`GTJ-DIS-03`

---

### GTJ-DIS-03 · 직접 할인 프로그램 목록 조회 (View Discount Program List)

**목적 / Purpose**
등록된 직접 할인 프로그램의 목록과 각 항목의 정보를 확인한다.

**목록 표시 항목 / List Columns**

| 항목 (KO) | Column (EN) | 설명 |
|---|---|---|
| 프로그램명 | Program name | 등록된 프로그램 이름 |
| 상태 | Status | **운영 중(Running) / 중지됨(Stopped) / 종료됨(Expired)** 3종 |
| 참여 호텔 수 | Number of participating hotels | 프로그램에 포함된 호텔 개수 |
| 적용 대상 | Applicable bookings | 특정 투숙일(stay date)을 가진 예약에 적용 |
| 생성자 | Creator | 프로그램을 생성한 사용자 |

**주의사항 / Notes**
- 할인은 **투숙일(stay date) 기준**으로 적용된다. 예약일 기준이 아니다.

**관련 항목 / Related**
`GTJ-DIS-02`, `GTJ-DIS-04`

---

### GTJ-DIS-04 · 직접 할인 프로그램 중지 (Stop a Direct Discount Program)

**목적 / Purpose**
운영 중인 직접 할인 프로그램을 중지한다.

**절차 / Steps**

1. 목록에서 대상 프로그램의 **[프로그램 중지 / Stop Program]** 선택
2. 확인 팝업에서 **[프로그램 중지 / Stop Program]** 재클릭하여 확정

**주의사항 / Notes**
- ⚠️ **[프로그램 중지]** 버튼은 상태가 **운영 중(Running)** 인 프로그램에만 노출된다.
- 확인 팝업에서 한 번 더 클릭해야 실제 중지가 반영된다(2단계 확인).

**관련 항목 / Related**
`GTJ-DIS-03`

---

## 3.2 플래시 세일 설정 (Flash Sale Settings)

### GTJ-FLS-01 · 시간제 플래시 세일 설정 (Set Up Hourly Flash Sale)

**목적 / Purpose**
시간제(Hourly) 객실에 대한 플래시 세일 프로그램을 생성한다.

**진입 경로 / Path**
`어드민 > 객실 유형 관리 > 시간제(Hourly) 객실 유형 목록`

**절차 / Steps**

1. 시간제(Hourly) 객실 유형 목록으로 이동
2. **[플래시 세일 설정 / Set up Flash Sale]** 선택
3. 플래시 세일 설정 팝업 확인
4. **[프로그램 생성 / Create Program]** 선택
5. 시스템의 **성공 알림** 확인

**주의사항 / Notes**
- 시간제 플래시 세일 **가격 설정은 선택 사항(optional)** 이다.
  *(원문의 세부 조건은 매뉴얼에 미기재 — 보완 필요)*

**관련 항목 / Related**
`GTJ-FLS-02`, `GTJ-FLS-03`

---

### GTJ-FLS-02 · 오버나이트 플래시 세일 설정 (Set Up Overnight Flash Sale)

**목적 / Purpose**
오버나이트(Overnight) 객실에 대한 플래시 세일 프로그램을 생성한다.

**진입 경로 / Path**
`어드민 > 객실 유형 관리 > [오버나이트 / Overnight] 탭`

**절차 / Steps**

1. **[오버나이트 / Overnight]** 탭 선택
2. **[플래시 세일 설정 / Flash Sale Setup]** 선택
3. 플래시 세일 설정 팝업 확인
4. **[프로그램 생성 / Create Program]** 선택
5. 시스템의 **성공 알림** 확인

**관련 항목 / Related**
`GTJ-FLS-01`, `GTJ-FLS-03`

---

### GTJ-FLS-03 · 플래시 세일 중지 (Stop Flash Sale)

**목적 / Purpose**
진행 중인 플래시 세일 프로그램을 중지한다.

**절차 / Steps**

1. **타임라인(Timeline)** 에서 중지할 **객실 유형(Room Type)** 과 **예약 유형(Booking Type)** 선택
2. 플래시 세일 프로그램 상세 정보 확인
3. **[프로그램 중지 / Stop Program]** 선택
4. 시스템의 **성공 알림** 확인

**주의사항 / Notes**
- 중지는 **타임라인 화면**에서 수행한다. 객실 유형 + 예약 유형을 함께 지정해야 해당 프로그램 상세가 열린다.

**관련 항목 / Related**
`GTJ-FLS-01`, `GTJ-FLS-02`

---

## 3.3 추가 요금 설정 (Surcharge Settings) — *보완 필요 (Updating)*

### GTJ-SUR-01 · 추가 요금 설정 (Set Up Surcharges)

**목적 / Purpose**
특정 객실에 대해 기간·요일 조건으로 추가 요금을 설정한다.

**진입 경로 / Path**
`객실 설정 (Room Settings) > 해당 객실 > 추가 요금 (Surcharges)`

**절차 / Steps**

1. `객실 설정 > 해당 객실 > 추가 요금`으로 이동
2. **추가 요금 적용 기간** 선택 — 시작일/종료일 및 적용 요일
3. **추가 요금 금액** 입력 — **비율(%)** 또는 **정액(고정 금액)**
4. **[스케줄 생성 / Create Schedule]** 선택
5. **[저장 / Save]** 선택

**주의사항 / Notes**
- ⚠️ **권장 사항**: 여러 조건을 하나의 추가 요금으로 합치지 말고 **조건별로 분리해 생성**할 것. 이후 삭제·수정이 쉬워진다.
- 금액은 비율(%)과 정액 중 하나의 방식으로 입력한다.
- 🔧 본 항목은 원문에서 **Updating** 상태로 표기됨 — 최종 확정 전 재검증 필요.

**관련 항목 / Related**
`GTJ-SUR-02`, `GTJ-DSH-01` (순매출 계산식에 Surcharges 포함)

---

### GTJ-SUR-02 · 추가 요금 삭제 (Delete Surcharges)

**목적 / Purpose**
등록된 추가 요금 설정을 삭제한다.

**진입 경로 / Path**
`객실 설정 (Room Settings) > 해당 객실 > 추가 요금 (Surcharges)`

**절차 / Steps**

1. `객실 설정 > 해당 객실 > 추가 요금`으로 이동
2. **[삭제 / Delete]** 선택
3. 시스템의 **성공 알림** 확인

**주의사항 / Notes**
- 🔧 본 항목은 원문에서 **Updating** 상태로 표기됨 — 최종 확정 전 재검증 필요.

**관련 항목 / Related**
`GTJ-SUR-01`

---

## 3.4 빠른 객실 잠금 (Quick Room Lock)

### GTJ-QLK-01 · 빠른 객실 잠금 설정 (Set Up Quick Room Lock)

**목적 / Purpose**
현재 시점 기준으로 객실 판매를 즉시 차단한다. (예: 갑작스러운 객실 사용 불가)

**절차 / Steps**

1. **[빠른 객실 잠금 / Quick Room Lock]** 선택
2. 잠글 **예약 유형(Booking Type)** 선택
3. 잠글 **기간** 선택 — 시스템이 **현재 시간/당일을 기본값**으로 설정
4. 잠금 상세 내용 검토
5. **[잠금 스케줄 추가 / Add Lock Schedule]** 선택

**주의사항 / Notes**
- 기본값이 **현재 시각/당일**이므로, 미래 일정을 잠글 경우 기간을 반드시 수정한다.
- 사전 계획된 장기 잠금은 `GTJ-LCK-01~03`(객실 잠금 설정)을 사용하는 것이 적합하다.

**관련 항목 / Related**
`GTJ-QLK-02`, `GTJ-LCK-01`

---

### GTJ-QLK-02 · 빠른 객실 잠금 해제 (Delete Quick Room Lock)

**목적 / Purpose**
설정된 빠른 객실 잠금을 삭제한다.

**절차 / Steps**

1. **[객실 잠금 설정 / Room Lock Settings]** 선택
2. **객실 잠금 이력(Room Lock History)** 목록에서 해당 빠른 잠금 항목을 찾음
3. 🗑️ **삭제 아이콘** 선택
4. **[확인 / Confirm]** 선택

**주의사항 / Notes**
- 빠른 잠금의 **해제는 [객실 잠금 설정] 화면**에서 수행한다. (설정 화면과 해제 화면이 다름)

**관련 항목 / Related**
`GTJ-QLK-01`, `GTJ-LCK-04`

---

## 3.5 객실 잠금 설정 (Room Lock Settings)

> 공통: 예약 유형(시간제 / 일 단위 / 오버나이트)에 따라 선택 항목이 달라진다.

### GTJ-LCK-01 · 객실 잠금 – 시간제 (Room Lock – Hourly)

**절차 / Steps**

1. **호텔** 선택
2. **객실 유형(Room Type)** 선택
3. 예약 유형에서 **[시간제 / Hourly]** 선택
4. **날짜 범위 + 시간대(time slots)** 선택
5. **[잠금 스케줄 추가 / Add Lock Schedule]** 선택
6. 시스템의 **성공 알림** 확인

**주의사항 / Notes**
- 시간제는 **날짜 범위와 시간대를 모두** 지정해야 한다. (다른 예약 유형과 다른 점)

---

### GTJ-LCK-02 · 객실 잠금 – 일 단위 (Room Lock – By Day)

**절차 / Steps**

1. **호텔** 선택
2. **객실 유형(Room Type)** 선택
3. 예약 유형에서 **[일 단위 / By Day]** 선택
4. **날짜** 선택
5. **[객실 잠금 추가 / Add Room Block]** 선택
6. 시스템의 **성공 알림** 확인

---

### GTJ-LCK-03 · 객실 잠금 – 오버나이트 (Room Lock – Overnight)

**절차 / Steps**

1. **호텔** 선택
2. **객실 유형(Room Type)** 선택
3. 예약 유형에서 **[오버나이트 / Overnight]** 선택
4. **날짜** 선택
5. **[객실 잠금 추가 / Add Room Block]** 선택
6. 시스템의 **성공 알림** 확인

---

### GTJ-LCK-04 · 객실 잠금 해제 (Delete Room Lock Settings)

**절차 / Steps**

1. **[객실 잠금 설정 / Room Lock Settings]** 선택
2. 해제할 잠금 항목의 **[삭제 / Delete] 아이콘** 선택
3. 시스템의 **성공 알림** 확인

**관련 항목 / Related**
`GTJ-LCK-01`, `GTJ-LCK-02`, `GTJ-LCK-03`, `GTJ-QLK-02`

---

# 4. 리포트 (Reports)

## GTJ-RPT-01 · 특가 객실 리포트 다운로드 (Download "Shock-Discount Room" Report) — *보완 필요 (Updating)*

**목적 / Purpose**
특가(Shock-Discount) 객실 관련 리포트를 다운로드한다.

**현재 상태 / Status**
🔧 원문 매뉴얼에서 **Updating** 으로만 표기되어 있으며 세부 절차가 기재되어 있지 않다.

**보완 필요 항목 / To Be Confirmed**
- 진입 경로
- 조회 조건(기간, 호텔, 객실 유형 등)
- 다운로드 파일 형식 및 컬럼 정의
- 권한 조건

---

# 5. 용어집 (Glossary)

| 용어 (KO) | Term (EN) | 정의 |
|---|---|---|
| 시간제 | Hourly | 시간 단위로 이용하는 예약 유형 |
| 오버나이트 | Overnight | 야간 투숙 예약 유형 |
| 일 단위 | Daily / By Day | 일(日) 단위 예약 유형 |
| 순매출 | Net Revenue | 객실 요금 + 추가 요금 − 호텔 프로모션 |
| 수령 결제액 | Payments Received | 완료된 예약에 대해 고객이 실제 결제한 총액 |
| 직접 할인 | Direct Discount | 호텔이 직접 설정하는 기간·특정일 기반 객실 할인 프로그램 |
| 플래시 세일 | Flash Sale | 단기간 집중 할인 프로그램 (시간제/오버나이트 별도 설정) |
| 추가 요금 | Surcharge | 기간·요일 조건으로 부과하는 객실 추가 요금 (비율 또는 정액) |
| 빠른 객실 잠금 | Quick Room Lock | 현재 시점 기준으로 즉시 판매를 차단하는 기능 |
| 객실 잠금 | Room Lock / Room Block | 지정 기간 동안 객실 판매를 차단하는 기능 |
| 타임라인 | Timeline | 객실·예약 유형별 프로그램 현황을 확인·조작하는 화면 |
| 특가 객실 | Shock-Discount Room | 특가 프로모션이 적용된 객실 |

---

# 6. 상태 값 정의 (Status Values)

## 직접 할인 프로그램 상태 (Direct Discount Program Status)

| 상태 (KO) | Status (EN) | 의미 | 중지 버튼 노출 |
|---|---|---|---|
| 운영 중 | Running | 현재 적용 중인 프로그램 | ✅ 노출 |
| 중지됨 | Stopped | 운영자가 수동으로 중지한 프로그램 | ❌ 미노출 |
| 종료됨 | Expired | 적용 기간이 만료된 프로그램 | ❌ 미노출 |

---

# 7. 보완 필요 항목 (Open Items)

| ID | 항목 | 사유 | 담당/기한 |
|---|---|---|---|
| GTJ-SUR-01 | 추가 요금 설정 | 원문 `Updating` 표기 | TBD |
| GTJ-SUR-02 | 추가 요금 삭제 | 원문 `Updating` 표기 | TBD |
| GTJ-RPT-01 | 특가 객실 리포트 다운로드 | 원문 `Updating` — 절차 전체 미기재 | TBD |
| GTJ-FLS-01 | 시간제 플래시 세일 | "가격 설정은 선택 사항" 이후 세부 조건이 원문에서 끊김 | TBD |
| 전체 | 화면 캡처 | 각 아티클에 UI 스크린샷 미첨부 | TBD |
| 전체 | 권한 정책 | 기능별 접근 권한(역할) 정의 미기재 | TBD |
| — | Recent Changes | 원문 목차에 존재하나 본문 내용 미확보 | TBD |

---

# 8. 변경 이력 (Change Log)

| 버전 | 일자 | 변경 내용 | 작성 |
|---|---|---|---|
| 1.0 | 2026-08-28 | 원문 매뉴얼을 작업 단위 KB 아티클 18건으로 재구성. 용어집·상태값·보완항목 추가 | 초안 |
