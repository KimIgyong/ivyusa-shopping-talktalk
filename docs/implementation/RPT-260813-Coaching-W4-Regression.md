# RPT-260813 — 코칭 W4-A/B: 골든 질문 회귀 검증

- 계획: `docs/plan/PLN-260813-Coaching-W4-Regression.md` (상위: `PLN-260804` W4)
- 테스트: `docs/test/TCR-260813-Coaching-W4-Regression.md`
- 범위: **A(골든 세트) + B(회귀 실행)**. **D(persona 개정 이력)는 별도 PR** — 사용자 지시.

---

## 1. 왜 만들었나

W3 브라우저 실측에서 규칙을 적용하고 같은 질문을 재실행했더니 답변 문구는 바뀌었지만 의도한 변화는
보이지 않았다(TCR-260813-W3 §3 O-1). 거기서 분명해진 것은 **답변 하나로는 규칙이 먹혔는지 알 수 없다**는
사실이다. 모델은 같은 설정에서도 매번 다르게 쓰기 때문이다.

그래서 이 기능은 "판정기"가 아니라 **근거 제공기**로 만들었다. 여러 문항의 전/후를 나란히 보여주고,
같은 설정에서의 변동 폭(노이즈)을 따로 잴 수 있게 한다. 판정은 사람이 한다.

## 2. 변경 파일

**백엔드** (`apps/api/src/domain/ai-coach/`)
| 파일 | 내용 |
|---|---|
| `entity/golden-question.entity.ts` | 골든 질문 |
| `entity/golden-run.entity.ts` | 런(kind baseline/after/noise/manual, config_hash, truncated) + 항목 |
| `golden.service.ts` | 세트 CRUD, 순차 실행, config 해시, 비교 |
| `dto/request/golden.request.ts` | snake_case 요청 DTO |
| `ai-coach.controller.ts` | golden 7개 라우트 + **`apply-verified`** |
| `ai-coach.mapper.ts` / `ai-coach.module.ts` | camelCase 매퍼, 등록 |
| `error-code.constant.ts` | **E4017** `GOLDEN_SET_EMPTY` |
| `sql/migration_golden_regression.sql` | 신규 테이블 3종 |

**프론트엔드** (`apps/web/src/domain/ai-settings/`)
`golden.service.ts` · `RegressionSection.tsx`(카드) · `ComparisonModal.tsx`(전/후) ·
`AiSettingsPage.tsx` 한 줄 · i18n ×3(`regression.*` 29키)

## 3. 설계 결정

**① baseline은 변경 전에 찍혀야 한다 — 그래서 적용 흐름 안에 넣었다.**
설정이 적용되고 나면 이전 설정으로 답을 뽑을 방법이 없다(라이브 트래픽이 도는 설정을 임시로 되돌릴
수는 없다). `apply-verified`가 **baseline → 적용 → after**를 한 번에 수행하는 이유다.
비용 때문에 기본 `적용`은 그대로 두고 **선택형**으로 뒀다.

**② 판정하지 않는다.** 비교 응답은 신뢰도Δ·인용변경·길이Δ·문구변경만 준다. 노이즈를 모르는 상태에서
diff를 "회귀"라 부르면 거짓 경보를 양산한다. 대신 `sameConfig` 플래그로 **"이 비교는 변동을 재는
것"**임을 명시한다.

**③ 무상태 경로를 재사용한다.** `KnowledgeService.ask`가 이미 `rag.answer` + 모더레이션을 세션 없이
돌린다. 골든런은 대화·상담원 큐·분석을 오염시키지 않고, **새 파이프라인을 만들지 않으므로 실제 고객
경로와 갈라지지 않는다.**

**④ 조용한 절단 금지.** 상한 20문항을 넘으면 `truncated`를 세우고 로그를 남긴다. 일부만 돌고 완료로
보이는 런은 없는 것보다 나쁘다.

**⑤ 실패한 문항이 런을 죽이지 않는다.** Voyage 무료티어 rate limit이 이미 반복 관측된 상태라,
문항 단위 오류는 `error`로 기록하고 계속 간다.

**⑥ 질문은 텍스트로 매칭한다.** 세트에서 질문을 지우거나 고쳐도 과거 런과 비교가 된다.
`question_id`를 nullable로 두고 질문 원문을 항목에 복사해 둔 것도 같은 이유 — 나중의 편집이 과거를
고쳐 쓰지 못하게.

## 4. 테스트

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **8건** 통과 |
| 모노레포 전체 | **1,093 tests / 102 suites** 통과(무회귀) |
| typecheck | ✅ 9 tasks |
| 마이그레이션(로컬) | ✅ 테이블 3종 생성 |
| 실기동 | ✅ 부팅 정상, golden 7 + `apply-verified` 매핑 |
| E2E(로컬) | ✅ E4017 → 질문 추가 → 실행 → 노이즈 비교(`sameConfig=true`) → **`apply-verified` 순서·해시 검증**(`sameConfig=false`) → 되돌리기 |

⚠️ 로컬은 stub 엔진이라 답변이 결정적이다. **실제 변동 폭은 측정하지 못했다** — 노이즈 런의 진짜
값은 스테이징 실 LLM에서만 나온다.

## 5. 배포 상태

| 환경 | 상태 |
|---|---|
| main | ✅ PR [#268](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/268) `baf08e7` |
| staging | ✅ **배포 완료 2026-08-13** — SQL 선적용 → 배포 → 검증(부팅·라우트·에러 0) |
| production | ⬜ (호스트 미확보) |

### 배포 후 실 LLM 검증 — S-02 노이즈 기준선이 나왔다

상세는 TCR §3. **이 PR의 실질 산출물은 코드가 아니라 이 수치다.**

설정을 전혀 바꾸지 않고 같은 세트를 2회 돌린 결과:

| 신호 | 노이즈 거동 | 판단 가치 |
|---|---|---|
| **문구 변경** | **3/3 항상 바뀜** | ❌ 신호 아님 |
| 인용 변경 | 1/3 | ⚠️ 약한 신호 |
| **신뢰도** | **3/3 Δ=0** | ✅ 강한 신호 |

**W3 관측 O-1은 정상 노이즈였다.** "문구는 바뀌었는데 의도가 안 보인다"에서 문구 변경을 근거로
삼으려 한 것 자체가 틀렸다. 이 기능이 문구 변경을 회귀라고 부르지 않는 설계가 옳았음이 실측으로 확인됐다.

그리고 같은 취지의 규칙을 `apply-verified`로 적용하자 **배송 문항만** "기다리시는 마음 충분히
이해합니다."로 시작하고 나머지 두 문항은 그대로였다 — W3에서 판단할 수 없던 것을 이제 판단할 수 있다.

### ⚠️ 마이그레이션 (코드 배포 **전**)

```bash
docker cp sql/migration_golden_regression.sql ivy_mysql_staging:/tmp/m.sql
docker exec ivy_mysql_staging sh -c 'mysql -u ivy -p"$MYSQL_PASSWORD" db_ivy_talktalk < /tmp/m.sql'
# 확인: SHOW TABLES LIKE 'golden%';  → 3개
```
롤백: 코드만 되돌리면 된다. 신규 테이블은 기존 기능이 참조하지 않는다.

## 6. 남은 일

1. **스테이징 실 LLM 검증 S-01~S-06** (TCR §3). 특히 **S-02 노이즈 실측** — 이 수치가 앞으로
   "의미 있는 차이"의 기준선이 된다. 그리고 **S-04**: W3의 O-1을 이제 여러 문항으로 판단해 본다.
2. **W4-D — persona/rules 개정 이력**(별도 PR): 스냅샷 테이블, 코칭·수동 저장 양쪽 기록,
   목록·복원(⚠️ 초안으로 복원), 버전 노트.
3. 의도 판정(LLM 심판)은 이번 범위 밖 — 구조적 신호로 부족하다고 판단되면 그때.
4. 실행 이력 전용 화면(현재는 카드 안 최근 목록으로 갈음).
