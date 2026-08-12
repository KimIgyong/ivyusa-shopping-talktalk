# TCR-260813 — 에이전트 코칭 W3 테스트 케이스

- 대상: `docs/plan/PLN-260804-Agent-Coaching-Chat.md` **W3**
  (시뮬레이션 연동 · `kb_upsert` · `scenario_override`)
- 선행: W1+W2 `TCR-260804-Agent-Coaching-Chat.md` (실 LLM U-01~U-06 6/6 통과)
- 자동화: `coach-proposal.service.spec.ts` **21건** (기존 13 + 신규 8), 전체 **1,083건** 통과

---

## 1. 단위 테스트 (신규 8건, 전부 통과)

W3가 새로 만드는 위험은 두 가지다 — **지식을 잘못된 곳에 쓰는 것**과 **권한을 우회하는 것**.

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| W3-01 | `kb_upsert` 파싱 시 `docId` 보존 | 개정 대상 문서를 지목할 수 있어야 함 | ✅ |
| W3-02 | 제목·카테고리 없는 **신규** 문서 제안 | **드롭** — 찾을 수 없는 문서는 없느니만 못하다 | ✅ |
| W3-03 | 신규 문서 적용 | `KnowledgeService.createDocument` 위임(재임베딩·개정이력·충돌스캔 확보) | ✅ |
| W3-04 | `docId` 있는 제안 적용 | 두 번째 문서를 만들지 않고 **해당 문서를 개정** | ✅ |
| W3-05 | **manager 랭크**가 `kb_upsert` 적용 시도 | **거부(E1004)**, KB 호출 0회 | ✅ |
| W3-06 | `kb_upsert` 되돌리기 | **거부(E4016)** — 문서 개정 이력으로 안내 | ✅ |
| W3-07 | `scenario_override` 적용 | 해당 action에만 기록, **다른 action 보존** | ✅ |
| W3-08 | `scenario_override` 되돌리기 | 교체 전 overrides 전체 복원 | ✅ |

**W3-05가 핵심이다.** manager는 `AI_SETTINGS_MANAGE`를 가지므로 라우트 가드를 통과해 코칭을 할 수
있지만 `KNOWLEDGE_SOURCE_MANAGE`는 없다. 코칭 스레드가 지식 쓰기 권한의 우회로가 되면 안 된다.

**W3-06의 이유**: KB 문서는 이미 `kb_document_revisions` + 복원 엔드포인트를 갖고 있다. 코칭 행에
스냅샷을 따로 두고 되돌리면 **Knowledge 콘솔에서 그 사이 한 편집을 조용히 날린다.** 두 번째 롤백
메커니즘을 만드는 대신 원래 것으로 보낸다.

---

## 2. 통합 검증 (로컬 실기동, 수행 완료)

`PORT=3012`, MySQL/Redis/Qdrant 로컬. 코칭 응답은 stub(무키)이라 **적용 경로를 시드 제안으로 직접 태웠다.**

| # | 검증 | 결과 |
|---|---|---|
| I-01 | 실기동 | ✅ `Nest application successfully started`, 에러 0 |
| I-02 | 존재하지 않는 `ref_message_id` 전송 | ✅ 크래시 없이 무시(`refTurn: null`), 턴은 정상 처리 |
| I-03 | `kb_upsert` 적용 | ✅ 문서 #390 생성(`[policy] Return shipping fees`) — 목록 API에서 확인 |
| I-04 | `scenario_override` 적용 | ✅ `GET /ai-config`의 `scenarioOverrides.cancel_refund.reply.EN` 반영 |
| I-05 | `kb_upsert` 되돌리기 | ✅ **E4016** "Undo this from the knowledge document revision history" |
| I-06 | `scenario_override` 되돌리기 | ✅ `reverted`, overrides가 `{}`로 복원 |

검증용 데이터(문서 #390, 코칭 스레드·제안)는 전부 삭제하고 `must_change_password`도 원복했다.

---

## 3. 미수행 — 브라우저 실측 (스테이징 배포 후)

패널 간 연동은 서버가 아니라 화면 상태라 자동화 범위 밖이다.

| # | 항목 | 확인 방법 |
|---|---|---|
| B-01 | 시뮬레이션 AI 버블 hover 시 **[코칭하기]** 노출 | 시나리오 스크립트 답변에는 **안 보여야** 함(영속 id 없음) |
| B-02 | [코칭하기] → 코칭 탭 전환 + 첨부 칩 표시 | 칩에 그 답변이 보이고 `×`로 해제 가능 |
| B-03 | 첨부 상태로 전송 → 답변에 **참조 턴 블록** 렌더 | conf/인용 배지가 저장값으로 표시 |
| B-04 | 탭 왕복 시 **프리뷰 세션 유지** | 대화가 초기화되지 않아야 함(패널을 unmount하지 않음) |
| B-05 | 제안 적용 후 **[시뮬레이션에서 확인]** | 프리뷰 탭 전환 + 같은 질문 자동 재실행 |
| B-06 | `kb_upsert` 카드에 되돌리기 버튼 **없음** + 이력 안내 문구 | E4016을 부를 버튼을 애초에 노출하지 않음 |
| B-07 | 실 LLM에서 사실 피드백 → **`kb_upsert` 제안 생성** | W1에서 "지식 문서가 필요하다"고 안내만 하던 것이 이제 제안이 되는지 |
| B-08 | 카테고리 없는 신규 문서 제안이 나오지 않는지 | 컨텍스트의 `EXISTING_CATEGORIES` 중에서 고르는지 |

**B-07이 W3의 실질 목표다.** U-02에서 확인된 "사실은 규칙이 아니다"가 이제 **막는 데 그치지 않고
올바른 곳으로 보내는지**를 봐야 한다.
