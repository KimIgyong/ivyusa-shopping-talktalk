# TCR-260829 — 지식 페이지 2차(카테고리 그룹 축) 테스트

- 근거: `docs/plan/PLN-260829-KB-Category-Group-Axis.md`

## 1. 단위 테스트

**신규 `kb-category.group.spec.ts` (6케이스)**

| # | 케이스 | 결과 |
|---|---|---|
| U1 | ensure(): 타 그룹 동명 존재 시에도 자기 그룹에 새로 생성 | ✅ |
| U2 | ensure(): (그룹, 이름) 행 존재 시 no-op | ✅ |
| U3 | create(): 충돌은 자기 그룹 안에서만(타 그룹 동명 허용, 동그룹 중복 거부) | ✅ |
| U4 | rename(): 문서 일괄 UPDATE가 행의 그룹으로 스코프(타 그룹 동명 문서 보호) | ✅ |
| U5 | merge(): 그룹 교차 병합 거부 | ✅ |
| U6 | list(): 요청 그룹만 반환 | ✅ |

**갱신 `rag-retrieval-scope.spec.ts`**: 제외 구문이 NOT EXISTS + `(c.doc_group=kb.doc_group AND c.name=kb.category)` 쌍 매칭임을 단언(신규 1케이스 추가). 기존 "IN 허용목록 아님"·"catalog 비협소화"·"미분류 무영향" 단언 유지.

전체 회귀: **168 suites / 1,729 tests green** · typecheck 9/9 · i18n 6개 언어 complete.
(answer-reuse는 스코프 "존재 여부"만 검사(이름 대조 없음)라 그룹 축 무영향 — 코드·테스트 무변경 확인.)

## 2. 마이그레이션 검증 (로컬 MySQL)

| # | 시나리오 | 결과 |
|---|---|---|
| M1 | SQL 적용 → 컬럼 추가·백필·유니크 `(tenant_id, doc_group, name)` 교체 확인 | ✅ |
| M2 | 백필: 로컬 operation 업로드분 카테고리 5종 → operation, 기존 3종 → counsel | ✅ |
| M3 | **동일 SQL 재실행 → 전 단계 no-op (멱등)** | ✅ |

## 3. 통합 (로컬 실서버, `successfully started` 확인)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | `GET /knowledge/categories?group=operation` → 해당 그룹 5종+카운트만 | ✅ |
| I2 | `?group=counsel` → counsel 등록행 + counsel 문서 파생(unregistered) 문자열만 | ✅ |
| I3 | 같은 이름("스모크중복") counsel·operation 각각 생성 성공(id 분리) | ✅ |
| I4 | 같은 그룹 중복 생성 → 409 | ✅ |

## 4. UI 검증 (배포 후 육안 확인 예정)

- 카테고리 관리 카드 그룹 탭 3개(기본 Counsel), 탭 전환 시 선택 상태 초기화.
- 카테고리 추가가 활성 탭 그룹으로 생성, 카탈로그 잠금 섹션은 Product 탭에서만 실데이터.
- Add KB-Document: 그룹 변경 시 카테고리 자동완성이 그 그룹으로 갱신, 상세 편집
  datalist는 해당 문서의 그룹 기준.

## 5. 배포 절차 (RPT에 결과 기록)

1. **스테이징 SQL 선적용**(`migration_kb_category_group.sql`) → 백필 결과 확인
   (go2joy operation 15종 등).
2. 코드 배포 → 부팅·라우트 검증 → 콘솔 육안 확인.
