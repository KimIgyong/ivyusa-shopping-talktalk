# REQ-260825-Customer-Journey-Report

고객여정분석 리포트 — 요구사항 분석

- 요청일: 2026-08-25
- 요청 요지:
  - 실시간상담 **그룹 메뉴**에서는 우측 AI 브리핑 대신 **[고객여정분석]** 버튼
  - 그룹에 묶인 대화방의 내용을 분석해 **보고서 작성**, 기간 선택(전체/기간지정)
  - 담을 것: 최초 컨택 시점 · 주 채널(세션 소스) · 대화 횟수 · 자주 하는 질문과 답변 ·
    요청 해결 소요시간 · **매슬로우 욕구 5단계** 및 **필립 코틀러 마켓 4.0** 관점의 관계 단계
  - **작성 기준 조건을 별도 관리**해 지속 업그레이드
  - 모든 리포트는 **작성일자별 저장·열람**
  - 두 리포트를 골라 **변경·개선점을 다시 분석하는 심화분석 리포트**
- 선행: `REQ-260824-LiveChat-Session-Grouping`(그룹), `PLN-260824`(AI 사용량 계측)

## 1. AS-IS

### 1.1 그룹은 이미 있습니다
`chat_groups`(kind=timeline|project, title) + `chat_group_members`(session_id)가 있고,
콘솔 라이브챗의 `scope='groups'`에서 `GroupRoom`으로 엽니다. **그룹은 뷰입니다** — 엔티티
주석대로 "It owns nothing": 해체해도 세션·대화·메시지는 남습니다.

즉 **분석 대상 범위는 이미 정의돼 있습니다**(그룹에 속한 세션들).

### 1.2 브리핑은 대화 단위입니다
`BriefingCard`는 `conversationId` 하나를 받아 그 대화의 브리핑을 읽고, 운영자가 누를 때
모델을 돌립니다(`briefing.service`, feature `agent_briefing`). **그룹 전체를 보는 것이
아닙니다** — 요청이 "그룹 메뉴에서는 브리핑 대신"인 이유입니다.

### 1.3 분석에 쓸 수 있는 데이터 — 대부분 이미 있습니다 ✅

| 요청 항목 | 데이터 출처 | 상태 |
|---|---|---|
| 최초 컨택 시점 | `sessions.created_at` 최소값 | ✅ |
| 주 채널(세션 소스) | `sessions.channel`(NULL=위젯, preview, 메신저 바인딩 등) | ✅ |
| 대화 횟수 | `conversations` 수 / `messages` 수 | ✅ |
| 자주 하는 질문 | `messages`(sender=customer) + `question_stat_daily`(이미 집계 존재) | ✅ |
| 해결 소요시간 | `conversations.created_at → ended_at`, `status` | ⚠️ §1.4 |
| 만족도 | `conversations.csat_rating` | ✅ |
| 여정 단계 | **`cjm_events.stage`**(Awareness/Browse/Inquiry/Purchase/Delivery/Post) | ✅ |
| 언어 | `sessions.language` | ✅ |

**`cjm_events`가 이미 여정 단계를 기록하고 있습니다.** 이 요구사항이 새로 만들어야 하는 것은
데이터가 아니라 **해석과 서술**입니다.

### 1.4 "해결 소요시간"은 지금 정의가 없습니다 ⚠️
`conversations`에는 `created_at`·`ended_at`·`status`(ai_active/waiting/agent/ended)가 있지만
**"해결됨"이라는 상태가 없습니다.** 방치 자동 종료(idle close)도 `ended`가 되므로,
`ended_at - created_at`을 그대로 "해결 소요시간"이라 부르면 **버려진 대화가 빠른 해결로
집계됩니다.** 정의를 먼저 정해야 합니다 → D3.

### 1.5 리포트를 저장할 곳이 없습니다
생성물(리포트)을 보관하는 테이블이 없습니다. `kb_documents`는 지식이지 보고서가 아니고,
`docs/`는 저장소 문서입니다. **신규 테이블이 필요합니다.**

## 2. 조사 — 무엇을 표준으로 삼을 것인가

요청에 "고객관계관리 모범 보고서를 참고하라"가 있어 조사했습니다.

### 2.1 코틀러 마켓 4.0 — 5A
Aware → Appeal → Ask → Act → **Advocate**. 깔때기가 아니라 **어느 단계로도 진입 가능한
경로**로 설계됐고, 코틀러는 충성도를 *"추천할 의향"*으로 정의합니다 — 재구매가 아니라.
([Sertis](https://sertiscorp.medium.com/the-5as-customer-path-a-framework-that-uses-5-stages-to-map-a-customer-s-journey-1ff9012073c7),
[PK Marketing](https://www.pkmarketing.jp/en/articles/4ato5a_en/),
[AMA](https://www.ama.org/marketing-news/kotlers-marketing-4-0-argues-the-marketplace-has-changed-and-the-customer-is-in-charge/))

> **설계 함의**: 상담 로그로 관측 가능한 것은 주로 **Ask·Act·Advocate**입니다. Aware/Appeal은
> 상담 이전에 일어나므로, 리포트는 그 둘을 **"관측 불가"로 명시**해야 합니다. 추정으로 채우면
> 근거 없는 단계 판정이 됩니다.

### 2.2 매슬로우 — 그대로 쓰면 안 됩니다
B2B/CX 문헌은 매슬로우를 **기능 품질 → 경제성 → 개인 가치**의 계층으로 번안해 씁니다.
동시에 *"매슬로우만으로는 단순하다"*는 비판이 확립돼 있습니다(Herzberg·Alderfer 병용 권고).
([B2B CX](https://www.linkedin.com/pulse/hierarchy-b2b-customer-experience-needs-g-david-dodd),
[MyCustomer](https://www.mycustomer.com/customer-experience/loyalty/what-maslows-hierarchy-of-needs-teaches-us-about-customer-experience),
[비판](https://tusharwarrier.com/2024/07/20/is-maslows-hierarchy-relevant-to-b2b-strategy/))

> **설계 함의**: 심리 5단계를 상담 로그에서 직접 판정할 수는 없습니다. **관측된 발화 근거를
> 인용**하고 그 위에 단계를 **가설로** 제시해야 합니다 → D4.

### 2.3 여정 분석 리포트 모범
- 지표를 늘리지 말 것 — *"대부분 조직이 15개 이상을 재고 아무것도 개선하지 않는다"*
- **리뷰 하나에 질문 하나, 액션 하나**를 묶을 것
- 지연이 어디서 생기는지 보는 지표: **loops(왕복 횟수) · handoffs(이관) · resolution time**
([Improvado](https://improvado.io/blog/customer-journey-analytics),
[MetricsWatch](https://www.metricswatch.com/blog/customer-journey-analytics),
[QuestionPro](https://www.questionpro.com/blog/customer-journey-analytics-metrics/))

> **설계 함의**: 리포트를 **지표 나열이 아니라 질문 → 근거 → 다음 행동**으로 구성합니다.

## 3. 갭 분석

| # | 갭 | 대응 |
|---|-----|------|
| **G1** | 그룹 단위 분석 진입점 없음 | `GroupRoom` 우측 패널을 브리핑 → **[고객여정분석]**으로 교체 |
| **G2** | 리포트 저장소 없음 | `journey_reports`(+ 스냅샷 지표 JSON, 본문, 기간, 작성자, 기준 버전) |
| **G3** | 작성 기준을 코드에 박으면 업그레이드 불가 | `journey_report_criteria` — 테넌트별 편집 가능한 프롬프트/규칙, **버전 보존** |
| **G4** | "해결 소요시간" 정의 부재 | D3에서 확정하고 **정의를 리포트에 함께 표기** |
| **G5** | 5A의 Aware/Appeal 관측 불가 | 리포트에 **관측 가능 범위를 명시**(추정 금지) |
| **G6** | 매슬로우 단정 위험 | 발화 인용 + "가설" 라벨 + 반증 가능한 서술 |
| **G7** | 심화분석(리포트 간 비교) | 두 리포트 id를 입력으로 받는 **비교 리포트 타입** |
| **G8** | 비용·시간 | 그룹 전체 메시지를 LLM에 넣으면 토큰이 큼 → 사전 집계 후 요약 투입, 사용량 계측에 잡힘 |
| **G9** | 모더레이션 | 생성물도 outbound — `ModerationService` 통과 필요(CLAUDE.md §2) |

**스키마 변경 필요** — 신규 테이블 2개(리포트, 기준).

## 4. 사용자 흐름

1. 라이브챗 → **그룹** 탭에서 그룹을 연다.
2. 우측 패널의 **[고객여정분석]** 클릭.
3. 기간 선택: **전체** 또는 **기간 지정**.
4. 생성 중 진행 표시 → 완료되면 리포트가 열린다.
5. 리포트는 **작성일자별 목록**에 쌓인다. 아무 때나 다시 열람.
6. 목록에서 **두 개를 선택 → [심화분석]** → 변경·개선점 리포트가 새로 생성된다.
7. 관리자는 **작성 기준**을 편집한다. 다음 리포트부터 새 기준이 적용되고, **과거 리포트는
   생성 당시 기준 버전을 그대로 붙들고 있다.**

## 5. 제약·전제

- **C1.** 상담 로그로 5A 전체를 관측할 수 없습니다(§2.1). Aware/Appeal은 비워야 합니다.
- **C2.** 매슬로우 단계는 **판정이 아니라 가설**입니다(§2.2). 근거 인용 없이 단정하면
  운영자가 잘못된 확신을 갖습니다.
- **C3.** "해결"의 정의가 없습니다(§1.4). 방치 종료를 빠른 해결로 세는 실수를 막아야 합니다.
- **C4.** 그룹은 뷰입니다. 세션이 그룹에서 빠지면 **과거 리포트의 근거가 달라집니다** →
  리포트에 **생성 시점의 대상 세션 목록을 스냅샷**으로 남겨야 재현 가능합니다.
- **C5.** 리포트 본문은 **테넌트 언어**로 씁니다(6종). 인용 발화는 원문 그대로.
- **C6.** LLM 생성물은 모더레이션 대상입니다(G9).
- **C7.** 토큰 비용이 큽니다. 그룹 메시지 수백 건을 그대로 넣지 않고 **사전 집계 + 대표 발화
  샘플링**으로 줄입니다. 비용은 [[ai-usage-metering]]의 `feature='journey_report'`로 잡힙니다.
- **C8.** 심화분석은 **원본 리포트 두 개를 입력**으로 받습니다. 원본이 지워지면 비교가
  성립하지 않으므로 리포트는 하드 삭제 대신 보관합니다.

## 6. 열린 결정 (기능정의서에서 확정)

| # | 결정할 것 | 선택지 | 권장 |
|---|---|---|---|
| **D1** | 생성 방식 | (a) 동기 생성(대기) (b) **비동기 작업 + 완료 알림** | **(b)** — 그룹이 크면 수십 초. 화면을 붙잡으면 운영자가 취소한다 |
| **D2** | 기준(criteria) 저장 단위 | (a) 전역 1벌 (b) **테넌트별 + 버전** | **(b)** — 업종마다 질문이 다르고, 과거 리포트의 재현에 버전이 필요 |
| **D3** | "해결 소요시간" 정의 | (a) `ended_at - created_at` 전부 (b) **상담원 종료·CSAT 응답 등 '해결 신호'가 있는 대화만**, 방치 종료는 별도 집계 | **(b)** — (a)는 버려진 대화를 가장 빠른 해결로 만든다 |
| **D4** | 매슬로우·5A 서술 강도 | (a) 단계 단정 (b) **가설 + 근거 인용 + 반증 조건** | **(b)** — §2.2의 비판이 확립돼 있다 |
| **D5** | 심화분석 입력 | (a) 최신 2건 자동 (b) **사용자가 2건 선택** | (b) — 요청 그대로 |
| **D6** | 리포트 삭제 | (a) 하드 삭제 (b) **보관(숨김)** | (b) — C8 |
| **D7** | 언어 | (a) 영어 고정 (b) **테넌트 언어** | (b) — C5 |

## 7. 결론

**데이터는 대부분 이미 있습니다**(§1.3). `cjm_events`가 여정 단계를, `question_stat_daily`가
질문 빈도를, `conversations`가 CSAT와 종료 시각을 이미 들고 있습니다. 이 요구사항이 새로
만드는 것은 **저장소·기준 관리·서술**입니다.

가장 주의할 것 셋:
- **"해결 소요시간"에 정의가 없습니다.** 그대로 재면 **방치된 대화가 가장 빠른 해결**이 됩니다(D3).
- **5A의 Aware/Appeal은 상담 로그로 관측 불가**합니다. 채우면 근거 없는 숫자가 됩니다(C1).
- **매슬로우는 단정하면 안 됩니다.** 문헌 자체가 단순화 비판을 담고 있습니다(C2/D4).

기능정의서: `docs/guide/GUIDE-260825-Customer-Journey-Report.md`
