# PLN-260825-Customer-Journey-Report

고객여정분석 리포트 — 구현 계획

- 근거: `REQ-260825-Customer-Journey-Report` / `GUIDE-260825-Customer-Journey-Report`(기능정의서)
- 확정된 결정: D1 비동기 · D2 테넌트별 기준+버전 · **D3 해결 신호(묻고-닫음 + 마지막 발화 조건)** ·
  D4 가설 서술 · D5 사용자가 2건 선택 · D6 보관(숨김) · D7 테넌트 언어 ·
  **O-2 상위 질문 5** · **O-3 샘플 200** · **O-4 기준 버전 상이 시 경고만**

## 0. 이 작업의 모양

```
그룹 → [고객여정분석] → 리포트 행 생성(status=pending) → 비동기 생성
                                              │
   ┌──────────────────────────────────────────┘
   │ 1. 대상 확정   그룹 세션 ∩ 기간 → session_ids 스냅샷
   │ 2. 집계(코드)  채널·대화량·왕복·이관·해결·CSAT·cjm 단계·상위질문 5
   │ 3. 샘플링      대표 발화 ≤200
   │ 4. 서술(LLM)   기준 버전의 지시문 + 집계값 + 샘플 → 본문
   │ 5. 모더레이션  통과해야 저장
   └→ status=ready, 본문·집계·스냅샷·기준버전 함께 보관
```

**숫자는 코드가 만들고, 모델은 서술만 합니다.** 모델에게 세게 하면 그럴듯하고 틀린 숫자가
나오며, 리포트는 그것을 근거처럼 보이게 만듭니다.

## 1. 스키마 (신규 2 테이블)

```sql
CREATE TABLE journey_reports (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id          BIGINT       NOT NULL,
  group_id           BIGINT       NOT NULL,
  -- journey | comparison. 비교 리포트는 원본 두 건을 입력으로 받는다.
  kind               VARCHAR(16)  NOT NULL,
  period_from        DATE         NULL,   -- NULL,NULL = 전체
  period_to          DATE         NULL,
  -- 이 리포트가 어떤 기준으로 쓰였는지. 기준을 고쳐도 과거 리포트는 안 변한다.
  criteria_version   INT          NOT NULL,
  -- 그룹은 뷰라서 구성원이 나중에 바뀐다. 재현하려면 그때의 대상이 필요하다.
  session_ids_json   JSON         NOT NULL,
  metrics_json       JSON         NULL,   -- 코드가 만든 집계값 원본
  body_md            MEDIUMTEXT   NULL,   -- 모델이 쓴 본문
  language           VARCHAR(8)   NOT NULL,
  status             VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending|ready|failed
  error              VARCHAR(255) NULL,
  source_report_ids  JSON         NULL,   -- kind=comparison일 때 두 개
  engine_id          BIGINT       NULL,   -- 무엇이 썼는지(삭제돼도 기록은 남게 NULL 허용)
  provider           VARCHAR(24)  NULL,
  model              VARCHAR(64)  NULL,
  hidden             TINYINT(1)   NOT NULL DEFAULT 0,  -- 하드 삭제 없음(비교 입력이 사라지면 안 됨)
  created_by         BIGINT       NOT NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at        DATETIME     NULL,
  KEY idx_jr_lookup (tenant_id, group_id, created_at),
  KEY idx_jr_status (tenant_id, status)
);

CREATE TABLE journey_report_criteria (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       BIGINT      NOT NULL,
  version         INT         NOT NULL,
  sections_json   JSON        NOT NULL,   -- 절별 지시문
  top_questions_n INT         NOT NULL DEFAULT 5,
  sample_cap      INT         NOT NULL DEFAULT 200,
  quote_max_chars INT         NOT NULL DEFAULT 200,
  tone            VARCHAR(64) NULL,
  banned_json     JSON        NULL,       -- 금지 표현
  created_by      BIGINT      NOT NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_jrc (tenant_id, version)
);
```

**현재 기준 = 그 테넌트의 최대 version.** 활성 플래그를 따로 두지 않습니다 — 두 곳이 어긋나면
어느 쪽이 진짜인지 알 수 없습니다.

**리포트 행이 곧 작업입니다.** 카탈로그 동기화는 상태를 메모리에 두지만(감사 로그가 durable
기록이고 작업이 멱등이라) 여기서는 **리포트 자체가 결과물**입니다. 재시작으로 사라지면 결과가
없어집니다. → 부팅 시 **오래된 `pending`을 `failed`로 정리**하고 사유를 남깁니다(§5 R3).

## 2. 집계 규칙 (코드가 계산)

| 값 | 계산 |
|---|---|
| 최초 컨택 | `MIN(sessions.created_at)` |
| 채널 분포 | `sessions.channel` 별 세션 수, NULL=위젯 |
| 대화량 | 대화 수, 메시지 수, 고객:상담원 비 |
| 왕복(loops) | 대화별 발화자 전환 횟수의 평균 |
| 이관(handoffs) | `assignments` 변경 + AI→상담원 전이 수 |
| **해결** | 상담원 종료 / CSAT 응답 / **묻고-닫음** — 단 묻고-닫음은 **침묵 직전 마지막 발화가 상담원·AI일 때만**(D3) |
| 미해결 | 마지막 발화가 고객인 묻고-닫음 · 무응답 방치 종료 — **건수만 별도** |
| 해결 소요시간 | 해결로 집계된 대화의 `첫 메시지 → 종료` 중앙값(평균 아님 — 긴 꼬리가 평균을 끌고 감) |
| CSAT | `csat_rating` 평균·응답률 |
| 여정 단계 | `cjm_events.stage` 분포와 최근 단계 |
| 상위 질문 | 고객 발화 클러스터 상위 **5**(O-2) |

⚠️ **묻고-닫음 판정 근거**: `close()`가 `idle_prompt_at`을 NULL로 지우므로 종료된 행만으로는
알 수 없습니다. **감사 기록**(`chat.idle_prompted` → `chat.idle_closed`)을 씁니다.

## 3. 단계별 계획

### W1 — 데이터·기준 (PR 1)
- 엔티티 2개 + 마이그레이션. nullable 컬럼은 **명시적 `type:`**(dev-kit A-1: 빠뜨리면 부팅이
  죽고 `tsc`는 못 잡습니다).
- `JourneyMetricsService` — §2 전부를 **순수 집계로**. LLM 없음. 단위 테스트의 본체.
- `JourneyCriteriaService` — 조회(최대 버전)·저장(새 버전)·기본 v1 시딩.
- 테스트: 해결 판정 4갈래, 중앙값, 채널 NULL=위젯, 기간 경계, 그룹 구성원 변경 후 스냅샷 재현.

### W2 — 생성·비동기 (PR 1)
- `JourneyReportService.request()` → 행 생성(pending) 후 즉시 반환, 백그라운드 실행.
- 프롬프트 조립: 기준 버전 지시문 + 집계 JSON + 샘플 ≤200.
- LLM 호출은 게이트웨이 경유, **`feature='journey_report'`**([[ai-usage-metering]]).
- **모더레이션 통과 후에만 저장**. 막히면 `failed` + 사유(부분 저장 금지).
- 비교 리포트: 원본 2건의 `metrics_json`을 나란히 넣고 **기준 버전이 다르면 그 사실을
  프롬프트와 본문 상단에 명시**(O-4 경고만).
- 부팅 시 stale pending 정리.

### W3 — 콘솔 (PR 1)
- `GroupRoom` 우측 패널: 브리핑 → **[고객여정분석]**(§4-1)
- 리포트 뷰어, 지난 리포트 목록, 2건 선택 → 심화분석
- **기준 편집 화면**(설정 → 기타, master 전용)
- i18n 6종 + `i18n:check`

### W4 — 배포·검증·문서 (PR 2 = docs)
- **SQL 선적용** → 코드 배포 → 내용 검증(실제 그룹으로 1건 생성, 숫자 대조)
- TCR/RPT + 메모리

## 4. UI 와이어프레임 (필수)

**① 그룹 우측 패널** — 기능정의서 §2-1 그대로.

**② 리포트 뷰어**
```
┌ 고객여정분석 — 2026-08-25 생성 ───────────────────────┐
│ 기간 전체 · 대상 세션 12 · 기준 v3 · claude-opus-4-8   │
│ ────────────────────────────────────────────────────── │
│ ① 요약                                                 │
│   질문:  왜 같은 배송 문의가 3번 반복되는가             │
│   답:   1차 답변이 추적번호를 주지 않아서               │
│   다음: 배송 안내 템플릿에 추적번호 필수화              │
│                                                        │
│ ② 접촉 이력   최초 2026-03-02 · 주 채널 위젯(9/12)     │
│               대화 24 · 메시지 310 · 왕복 평균 4.2      │
│ ③ 무엇을 묻는가   상위 5 …                              │
│ ④ 해결 소요시간   중앙값 2시간 14분                     │
│    ┌ 집계 정의 ────────────────────────────────┐        │
│    │ 해결: 상담원 종료 · CSAT 응답 · 묻고-닫음  │        │
│    │      (침묵 직전 마지막 발화가 상담원/AI)   │        │
│    │ 제외: 고객 발화로 끝난 묻고-닫음 3건       │        │
│    │      무응답 방치 종료 1건                  │        │
│    └────────────────────────────────────────────┘        │
│ ⑤ 5A   Ask ●  Act ●  Advocate ○                        │
│        Aware·Appeal — 관측 범위 밖                      │
│ ⑥ 욕구 단계(가설)                                       │
│    "또 물어봐야 하나요" (8/12) → 존중 층위 가설         │
│    반증: 다음 달 반복 문의가 0이면 이 가설은 틀림       │
│ ⑦ 다음 행동 …                                          │
└────────────────────────────────────────────────────────┘
```

**③ 심화분석 선택**
```
지난 리포트   ☑ 2026-08-25 전체     ☑ 2026-07-01 06-01~06-30
              ☐ 2026-06-02 전체
              ⚠ 두 리포트의 기준 버전이 다릅니다(v3 / v1).
                차이의 일부는 고객이 아니라 기준 변경에서 옵니다.
                                            [ 심화분석 생성 ]
```

**④ 기준 편집 (설정 → 기타, master)**
```
┌ 고객여정분석 작성 기준  현재 v3 ──────────────┐
│ 절별 지시문                                    │
│  ① 요약        [세 문장 이내. 질문·답·행동…]   │
│  ⑥ 욕구 단계   [인용·가설·반증조건 3종 필수…]  │
│ 상위 질문 수 [5]   샘플 상한 [200]             │
│ 인용 최대 [200]자   금지 표현 [관계 점수, …]   │
│ ⓘ 저장하면 v4가 됩니다. 지난 리포트는 각자     │
│   작성 당시 버전을 그대로 유지합니다.          │
│                    [미리보기]  [저장]          │
└────────────────────────────────────────────────┘
```

## 5. 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| `GroupRoom` | 브리핑 카드 → 여정분석 패널 | **그룹에서만** 교체. 대화 1건 화면의 브리핑은 그대로 |
| AI 사용량 | 새 feature 축 `journey_report` | 이미 계측됨. 리포트 1건이 큰 호출이라 사용량에 뚜렷이 잡힘 |
| 모더레이션 | 생성물 1건이 통째로 대상 | 막히면 `failed`. 부분 저장 없음 |
| `chat_groups` | 무수정 | 그룹은 계속 뷰. 리포트가 스냅샷을 들고 감 |
| 감사 | 생성·기준 변경 기록 | `AuditService` |
| 보존 | 리포트는 폐기 대상 아님(사람이 만든 산출물) | [[ai-usage-metering]]의 400일 창과 무관 |
| DB | **신규 테이블 2개** | SQL 선적용 |

## 6. 리스크

- **R1. 숫자를 모델이 만들면 틀립니다.** 집계는 전부 코드, 모델에는 **완성된 값만** 넘깁니다.
  프롬프트에 "숫자를 계산하지 말 것"을 명시하고, 본문의 숫자가 `metrics_json`과 다르면
  **불일치를 리포트에 표시**합니다.
- **R2. 토큰 비용.** 그룹 메시지 수백 건 → 집계 + 샘플 200으로 축소. 그래도 리포트 1건이 큰
  호출입니다. 사용량 화면에서 바로 보입니다.
- **R3. 재시작 중 유실.** 리포트 행이 곧 작업이므로 `pending`이 영영 남을 수 있습니다 →
  부팅 시 오래된 pending을 `failed`로 정리하고 재시도 안내.
- **R4. 그룹 구성원 변경.** 스냅샷이 없으면 같은 리포트를 다시 못 만듭니다 → `session_ids_json`.
- **R5. 매슬로우·5A 단정.** 기준 지시문에 인용·가설·반증조건 3종을 **필수**로 박고,
  금지 표현에 "관계 점수" 같은 의사 정량 표현을 기본 포함합니다.
- **R6. 기준 변경이 비교를 오염**시킵니다 → 버전 상이 경고(O-4).

## 7. 테스트
- 단위: 해결 판정 4갈래(상담원종료·CSAT·묻고-닫음 O/X) · 중앙값 · 채널 NULL · 기간 경계 ·
  스냅샷 재현 · 기준 최대버전 선택 · 비교 시 버전 상이 플래그
- 통합: 실제 그룹 1건 생성 → `metrics_json`과 본문 숫자 대조 · 모더레이션 차단 시 미저장
- 배포: SQL 선적용 → 라우트 401 → 리포트 1건 생성 후 **숫자 수동 대조**

---
**승인 요청**: 승인 시 **W1(집계·기준)부터** 착수합니다. 집계가 먼저 정확해야 서술이 의미를
갖습니다 — 순서를 바꾸면 그럴듯한 문장이 틀린 숫자를 덮습니다.
