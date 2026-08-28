# RPT-260829 — 지식 페이지 2차: 카테고리 그룹 축

- 요구/계획/테스트: `REQ-260829-Knowledge-Page-Enhancements.md`(R2) →
  `PLN-260829-KB-Category-Group-Axis.md`(승인) → `TCR-260829-KB-Category-Group-Axis.md`
- **PR #437** (squash) — main `fa8a38b`, 2026-08-29

## 1. 무엇이 바뀌었나

1. **스키마**: `kb_categories.doc_group` 신설, 유니크 `(tenant_id, doc_group, name)` —
   같은 이름이라도 그룹이 다르면 별개 카테고리·별개 에이전트 스코프.
   `sql/migration_kb_category_group.sql`(멱등: 컬럼→백필 2단계→유니크 교체).
2. **서비스 그룹 스코프**: list/ensure/create가 그룹 안에서만 충돌, rename/merge의 문서
   일괄 UPDATE에 `doc_group` 조건(타 그룹 동명 문서 오염 차단 — 그룹 축 도입으로 새로
   생기는 결함을 선제 봉쇄), 그룹 교차 병합 거부. ensure() 호출부 그룹 전달
   (카탈로그 동기화=product, 일괄등록=업로드 그룹).
3. **RAG 에이전트 제외 정밀화**: (doc_group, name) 쌍 매칭(NOT EXISTS) — 이름 전역
   매칭이었다면 한 그룹만 좁혀도 타 그룹 동명이 함께 어두워짐. answer-reuse는 스코프
   존재 검사뿐이라 무변경.
4. **콘솔**: 카테고리 관리 카드 그룹 탭 3개(기본 Counsel, 전환 시 선택 상태 초기화),
   카테고리 추가=활성 탭 그룹, Add KB-Document 카테고리 자동완성=선택 그룹,
   상세 편집 자동완성=해당 문서의 그룹.

## 2. 테스트·배포 상태

| 항목 | 상태 |
|---|---|
| 단위/회귀 | 그룹 축 6케이스 + 검색 스코프 쌍 매칭 단언 신규 · **168 suites / 1,729 green** · typecheck·i18n complete |
| 마이그레이션 | 로컬 적용→백필 검증→재실행 멱등 확인. **스테이징 선적용 완료**(코드 배포 전): 백필 결과 테넌트별 정확(go2joy operation 15 · 테넌트1 product 44/counsel 19 등) |
| 배포 | 스테이징 `deploy-staging.sh` — `successfully started`·health ok. **SQL 선적용→코드 배포 순서 준수** |
| 스테이징 API 검증 | go2joy `categories?group=operation` 15종 / `?group=counsel` 4종 — 그룹 분리 정확 |
| UI 육안 확인 | 그룹 탭 3개 렌더·전환 정상, Counsel 4종(1/5 agents 스코프 뱃지 포함)·Operation 15종 목록, 행별 Rename/Hide/Delete/에이전트 액션 표시 |

## 3. 과정 기록

- CI 1차 실패: 신규 `sql/*.sql` 추가 시 **`npm run migrations:manifest` 재생성 필수**
  (`sql/artefacts.tsv` 게이트) — 매니페스트 커밋 후 통과. 기존에 기록된 함정의 재확인.

## 4. 잔여 (3차)

- R4 파일(pdf/docx/xlsx/csv) AI 인제스천 + R5 영상 P1(YouTube 자막) — REQ-260829 승인
  로드맵의 마지막 단계, 후속 PLN 예정.
- 프로덕션: 미배포(호스트 미정). 배포 시 `migration_kb_category_group.sql` **선적용 필수**.
