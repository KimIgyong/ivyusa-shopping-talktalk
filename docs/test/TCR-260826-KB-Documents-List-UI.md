# TCR-260826 지식 문서 목록 UI 개편 — 테스트 케이스

- 근거: `docs/plan/PLN-260826-KB-Documents-List-UI.md`

## 1. 유닛 (자동, `knowledge.service.list.spec.ts` 신규 5케이스)

| # | 케이스 | 기대 |
|---|---|---|
| U1 | active/source/status 필터 | where에 등가 조건으로 반영(`active`는 숫자 강제), tenantId 항상 포함 |
| U2 | 파라미터 없음 | where=tenant만, order=`{id: DESC}` — 기존 호출과 동일(무회귀) |
| U3 | sort=title asc / updated desc | `{title: ASC, id: DESC}` / `{updatedAt: DESC, id: DESC}` (id 타이브레이커) |
| U4 | 화이트리스트 밖 sort(인젝션 문자열) | 기본 정렬로 폴백 — 사용자 입력이 ORDER BY에 도달하지 않음 |
| U5 | facets | tenant 스코프 DISTINCT source/status 반환 |

전체 스위트 **156 suites / 1,653 tests 통과** (2026-08-26). typecheck·build·i18n:check(6언어)·실부팅 `successfully started` ✅.

## 2. 스테이징 수동 스모크 (배포 후)

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | 목록 기본 화면 | 4열(카테고리·제목≈80%·수정일·⋯), 필터 미사용 시 기존과 동일한 순서/건수 |
| S2 | 노출 필터 '숨김' | active=0 문서만, 페이지네이션 총건수 일치 |
| S3 | 출처 셀렉트 | 옵션=테넌트 실재 값(facets), 선택 시 해당 출처만 |
| S4 | 상태 '대기' | pending만; 카테고리·그룹 필터와 AND 병행 |
| S5 | 제목 헤더 클릭 ×3 | 가나다순 → 역순 → 기본(최신순), 화살표 표시, **2페이지에서도 정렬 일관** |
| S6 | 수정일 헤더 정렬 | 정순/역순 동작, 제목 정렬과 상호 배타 |
| S7 | ⋯ 팝오버 | 노출 토글(토스트)·출처/상태 배지·원본 링크(있을 때)·삭제(확인창) 전부 동작, 외부 클릭/스크롤 시 닫힘 |
| S8 | 필터 변경 | 항상 1페이지로 리셋 |

결과는 RPT-260826-KB-Documents-List-UI에 기록.
