# RPT-260813 — 에이전트 코칭 W3 구현 보고

- 계획: `docs/plan/PLN-260804-Agent-Coaching-Chat.md` **W3**
- 테스트: `docs/test/TCR-260813-Agent-Coaching-W3.md`
- 선행: W1+W2 (PR #99, 스테이징 LIVE) · 결함 수정 (PR #102) · 실 LLM 검증 (PR #263)

---

## 1. 무엇이 달라졌나

W1에서는 관리자가 사실을 고쳐 말해도 코칭이 **막기만** 했다("지식 문서가 필요합니다, Knowledge
콘솔로 가세요"). 안티패턴은 피했지만 일은 사람이 다른 화면에서 다시 해야 했다.
W3는 그 사실을 **올바른 곳으로 보내는 제안**으로 만든다.

| | W1+W2 | W3 |
|---|---|---|
| 사실 피드백 | 안내만 (제안 0건) | **`kb_upsert` 제안** — 신규 문서 또는 기존 문서 개정 |
| 시나리오 버튼 문구 | 코칭 대상 아님 | **`scenario_override` 제안** |
| 시뮬레이션 ↔ 코칭 | 단절 (탭만 나뉨) | **답변을 코칭으로 넘기고, 적용 후 되돌아와 재실행** |

## 2. 변경 파일

**백엔드**
| 파일 | 변경 |
|---|---|
| `entity/coaching-proposal.entity.ts` | `KB_UPSERT`·`SCENARIO_OVERRIDE` 타입, payload 필드(doc*/scenario*) |
| `coach-context.service.ts` | 두 타입의 출력 규약, 사실→KB 라우팅(막기 아니라 보내기), 기존 문서 개정 우선, 시나리오 **action** 목록·기존 편집 표시, KB 블록에 **docId**와 `EXISTING_CATEGORIES` |
| `coach-proposal.service.ts` | 두 타입의 파싱·적용, KB 권한 게이트, KB 되돌리기 거부 |
| `ai-coach.service.ts` | 스니펫에 `docId` 부착, 카테고리 목록 조회 |
| `ai-coach.controller.ts` / `dto` / `mapper` | actor(rank·labels) 전달, `doc_content`·`scenario_reply` 오버라이드, 응답 필드 |
| `ai-coach.module.ts` | `KnowledgeModule` import |
| `error-code.constant.ts` | **E4016** `COACH_REVERT_UNSUPPORTED` |
| `chat.service.ts` · `widget.types.ts` | AI 턴 응답에 **`messageId`** (프리뷰가 코칭 앵커로 사용) |

**프론트엔드**
| 파일 | 변경 |
|---|---|
| `PreviewPanel.tsx` | AI 버블에 **[코칭하기]**(hover), 응답 `messageId` 보관, `replayQuestion` 재실행 |
| `AiStudioPanel.tsx` | 탭 간 상태(코칭 대상·재실행 질문) 보유, **두 패널 상시 mount** |
| `CoachPanel.tsx` | 첨부 칩 + 해제, `ref_message_id` 전송, 카드에 재실행 콜백 전달 |
| `ProposalCard.tsx` | 두 타입 렌더(문서 신규/개정·카테고리, 시나리오 action·언어), 편집 오버라이드 분기, **[시뮬레이션에서 확인]**, KB는 되돌리기 버튼 숨김 |
| i18n ×3 | `coach.*` 9키, `preview.coachThis` |

## 3. 설계 결정

**① 지식 쓰기는 별도 권한으로 막았다.** manager는 `AI_SETTINGS_MANAGE`가 있어 코칭은 되지만
`KNOWLEDGE_SOURCE_MANAGE`가 없다. 라우트 가드는 전자만 보므로 적용 시점에 `userCan()`으로 한 번 더
검사한다. 코칭 스레드가 권한 우회로가 되면 안 된다.

**② KB 되돌리기는 우리가 하지 않는다(E4016).** 문서는 이미 개정 이력과 복원 엔드포인트를 갖고 있다.
코칭 행에 스냅샷을 따로 두고 되돌리면 그 사이 Knowledge 콘솔에서 한 편집을 조용히 날린다.
UI에서도 버튼 자체를 숨기고 이력으로 안내한다 — 누를 수 있는데 실패하는 버튼은 두지 않는다.

**③ 컨텍스트에 `docId`를 넣은 것이 개정을 가능하게 한다.** 없으면 모델은 **언제나 새 문서만**
제안할 수 있고, 그렇게 쌓인 지식 베이스는 스스로 모순된다(REQ §13.1 결론 5).

**④ 프리뷰 패널을 unmount하지 않는다.** 탭 전환마다 샌드박스 세션이 새로 만들어지면 "코칭하러
갔다 오니 대화가 사라지는" 동작이 된다. `hidden`으로 감춘다.

**⑤ 스키마 변경 없음.** `type`은 `varchar(32)`, `payload`는 JSON이라 새 값·새 필드가 그대로 들어간다.
**마이그레이션 불필요.**

## 4. 테스트

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **8건**(파싱 2 · 적용 4 · 되돌리기 2) 통과 |
| 코칭 스펙 전체 | **21건** 통과 |
| 모노레포 전체 | **1,083 tests / 101 suites** 통과 (무회귀) |
| typecheck | ✅ 9 tasks |
| 실기동 | ✅ 부팅 정상, 에러 0 |
| 적용 경로 E2E(로컬) | ✅ `kb_upsert`→문서 생성, `scenario_override`→config 반영, E4016 거부, 시나리오 되돌리기 복원 |

로컬 검증 데이터(문서 #390, 스레드·제안)와 `must_change_password`는 전부 원복했다.

## 5. 배포 상태

| 환경 | 상태 |
|---|---|
| main | ✅ PR [#265](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/265) `40be6d1` |
| staging | ✅ **배포 완료 2026-08-13** — 부팅 정상, 라우트 401, 에러 0 |
| production | ⬜ (호스트 미확보) |

**마이그레이션 없음** — 코드만 배포했다.

### 배포 후 실 LLM 검증 (B-07/B-08 통과)

상세는 TCR §2-1. 요지: **W1에서 막기만 하던 사실 피드백이 이제 올바른 문서의 개정 제안이 된다.**
반품 배송비를 코칭하자 기존 문서 `docId=40`의 $6.95와 모순된다고 먼저 되물었고, 값을 확정해 주자
**그 문서를 개정하는 `kb_upsert`**(카테고리 `policy_return`, 고객에게 답할 수 있는 산문)를 제안했다.
`scenario_override`도 action 키로 정확히 생성됐다. 제안은 승인하지 않았고 설정 무변경을 확인했다.

**검증이 찾아낸 결함 2건 — 같은 PR에서 수정:**

- **D-1 supersede 누락**: 같은 `cancel_refund`를 겨냥한 pending 제안 2건이 서로를 무효화하지 않았다.
  `supersedePeers`가 persona·`targetRule`만 알고 있었다. W3에서 타입을 늘리며 확장하지 않은 탓.
  → `sharesTargetWith`로 분리하고 타입별 대상을 명시(persona 전체 / rule targetRule / scenario action /
  kb docId). 신규 문서 제안끼리는 무관하므로 무효화하지 않는다. 테스트 2건 추가(총 23건).
- **D-2 시나리오 원문 부재**: 모델이 "현재 스크립트 원문이 표시되지 않아 새로 작성했다"고 했다 —
  고치라고 한 문구를 처음부터 새로 쓴 것. → 테넌트 편집 본문을 컨텍스트에 포함.
  ⚠️ 내장 스크립트(편집 없는 버튼)의 원문은 코드에 있어 여전히 비공개이며, 그렇게 명시한다.

## 6. 남은 일

1. **브라우저 실측 B-01~B-06** (TCR §3) — 화면 상태(코칭 버튼 노출·첨부 칩·탭 왕복 시 세션 유지·
   재실행)는 자동화 범위 밖이라 사람이 봐야 한다. ~~B-07/B-08~~은 배포 후 실행해 통과.
2. **W4** — 골든 질문 회귀 검증, persona 개정 이력.
3. 제안 없을 때 붙는 메타 문장 제거(W1 검증에서 관측, 프롬프트에 `Do not announce the absence of a
   proposal` 추가했으나 실 LLM 재확인 필요).
