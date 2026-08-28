# RPT-260828 지식 소스 전환 내역 모달 — 구현 보고

- REQ: `docs/analysis/REQ-260828-Source-Conversion-History.md`
- PLN: `docs/plan/PLN-260828-Source-Conversion-History.md` (승인: 모달로 진행)
- TCR: `docs/test/TCR-260828-Source-Conversion-History.md`

## 배포 상태

| 항목 | 값 |
|---|---|
| PR | **#429** (squash) → main **`c2adc07`** |
| 마이그레이션 | 없음 (스키마 무변경 — 감사 로그 재사용) |
| 스테이징 배포 | **2026-08-28 완료** — 부팅 `successfully started`, `/health` ok |
| 프로덕션 | 미배포 |

## 구현 내용

- **전환 내역 모달**: /knowledge 소스 이름 클릭 → 요약(유형·대상·마지막 동기화) + **동기화 실행 이력**
  (시각·결과·생성/갱신/유지/숨김·dropped/truncated·색인·소요·실패 사유) + **전환된 문서 목록**
  (제목 클릭=기존 문서 상세로 전환, 숨김 문서 포함, 페이지네이션).
- 실행 이력 = 감사 로그 `knowledge.source_synced` 재사용(결과 JSON 기축적, JSON sourceId 필터라
  기능 이전 행도 조회됨) — 신규 테이블 없음. **실패 실행도 감사 기록 보강**(status/error — 이전엔
  성공만 남아 이력이 전부 초록으로 보였음). 과거 실패 소급 불가는 화면에 고지.
- 신규 `GET /knowledge/sources/:id/runs`(KNOWLEDGE_SOURCE_MANAGE), 문서 목록은 기존 서버
  `source_id` 필터의 콘솔 노출. KnowledgeModule에 AuditLog 엔티티 등록(선택 주입 — 실부팅 검증).

## 테스트 결과

- 유닛 +2(실패 감사 기록·runs 필터/구행 기본값/actorId 정규화) — 전체 **165 suites / 1,705 tests 통과**,
  typecheck·build·i18n:check(6언어)·실부팅 ✅.
- 스테이징 스모크 (go2joy, 2026-08-28):
  - S1: 소스 7 실행 이력 5건 최신순 — **당일 예산 30→120→200 진행과 truncated 소멸이 이력에 그대로 보임**
    (12.7s truncated → 46.2s truncated → 50.7s 완전 → 56.9s 무변경). 과거 실패(오전 404 2건)는 고지대로 미표시.
  - S4: 문서 0건 소스(board) — 이력·문서 모두 빈 상태 정상.
  - 소스 7 문서 목록: 1건(embedded·노출). S6: 타 테넌트 조회 404 E5002 (테넌시 펜스).
  - S5(실패 기록 실증)는 유닛 U1로 갈음(라이브 실패 유발은 대상 훼손 필요) — 다음 자연 실패 발생 시 확인.
- UI 육안(S2/S3 — 모달 레이아웃·문서 상세 전환)은 운영 확인 잔여.

## 잔여
- UI 육안 S2/S3. 백로그: 실행 이력 전용 테이블(감사 보존 분리 필요 시), 문서 revision 타임라인 통합, C2 source 구분.
