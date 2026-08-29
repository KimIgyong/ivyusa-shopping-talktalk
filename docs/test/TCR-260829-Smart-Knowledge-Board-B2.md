# TCR-260829 — Smart Knowledge Board B2(채택+시뮬레이션) 테스트

- 근거: `docs/plan/PLN-260829-Smart-Knowledge-Board-B2.md`

## 1. 단위 테스트 (전체 176 suites / 1,771 green)

**신규 `board-review.service.spec.ts` (7)**: promote=BRD 키·2차 분류 우선 매핑·임베딩·
보드 상태 전이·감사 / **재채택=동일 키 갱신(중복 0)** / 카테고리 오버라이드 /
draft·rejected promote 거부+published만 reject+promoted→reopen / simulate=후보 8번째
인자 주입·모더레이션 게이트·**미인용이어도 유사도 보고** / 골든 A/B=문항당 2회 실행·
Δ·인용 집계 / 골든 부재 E4017.

**갱신 `knowledge-ingest.service.spec.ts`**: 승인이 KB가 아니라 **보드 게시**(published,
`ai-import` 태그, target='board')로 저장됨을 단언(P4-6). 기존 rag 스펙 전부 회귀 통과 —
`extraCandidates` 미전달 경로 무변경 보증.

## 2. 통합 (로컬 실서버 · stub, `successfully started`)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | 게시 문서 시뮬레이션 → 후보가 소스 목록에 `candidate:true`로 병합·인용, confidence 반환 (stub 임베딩이라 유사도 0 — 실 수치는 스테이징) | ✅ |
| I2 | 골든 질문 없는 테넌트 → E4017(버튼 안내 문구 매핑) | ✅ |
| I3 | 채택 → KB `BRD-2`·source=board·embedded, 보드 status=promoted·kbDocumentId 역링크, behind=false | ✅ |
| I4 | **개정 감지**: promoted 문서 본문 수정 → `revisionBehind:true` → 재채택 → false. 초기 타임스탬프 비교가 같은 초 내 편집을 놓쳐 **내용 비교(제목+본문)로 교체**(카테고리 오버라이드 오탐도 원천 제거) | ✅ |
| I5 | reopen(→published)·reject 전이, KB 행 잔존 확인 | ✅ |
| I6 | typecheck 9/9 · i18n 6개 언어 complete | ✅ |

## 3. UI 구현 확인 (스테이징 육안은 RPT에)

- 보드 편집: published→[시뮬레이션][KB 채택][보류](master/director만 — 서버 매트릭스와
  동일 게이팅), promoted→[재채택(개정 시)][게시로 복귀]+개정 미반영 뱃지.
- 시뮬레이션 모달: 답변 미리보기·후보 인용/유사도·confidence, 골든 A/B 표(Δ 색상)+요약,
  재실행 비용 확인 문구, 모달 내 [KB 채택].
- 보드 목록 상태 필터 칩 / KB 목록 출처 뱃지 / KB 상세 BRD 문서에 "보드 원본 열기"+분기
  경고 / AI 임포트 완료 문안 "보드에 게시됨".

## 4. 스테이징 검증 계획 (실 LLM — RPT에 기록)

1. 배포(코드만 — SQL 없음) → 라우트 401.
2. go2joy 보드 문서(id 1) 시뮬레이션(실 Voyage 유사도·실 LLM 답변) → 채택 →
   KB `BRD-1` 확인 → 개정→behind→재채택.
3. 콘솔 육안: 리뷰 버튼·시뮬레이션 모달·출처 뱃지.
