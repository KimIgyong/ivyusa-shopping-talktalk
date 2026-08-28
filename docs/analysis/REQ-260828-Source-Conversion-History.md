# REQ-260828 지식 소스 전환 내역 화면 — 노션 등 소스가 만든 지식의 이력 확인

- 작성일: 2026-08-28
- 요청 유형: [요구사항] — 노션 연동으로 지식 전환된 내역을 확인할 수 있는 페이지
- 배경: go2joy 노션 연동이 운영 진입(RPT-260828). 운영자가 "무엇이 언제 어떻게 지식이 됐는지"를 볼 곳이 없음.

## 1. AS-IS

- **소스 행에는 마지막 1회 결과만**: `last_sync_at/status/result`(카운트·dropped/truncated·B1 error). 이전 실행들은 화면에서 소실.
- **실행 이력은 사실 이미 절반 기록 중**: 성공 동기화마다 감사 로그 `knowledge.source_synced`에
  결과 전체(JSON: sourceId·created/updated/…·embedded)가 저장됨. ⚠️ **실패 실행은 감사 미기록**(소스 행 갱신뿐).
- **전환된 문서 목록**: `kb_documents.source_id`로 소스별 연결돼 있고 서버 목록 필터 `source_id`도 존재하지만
  **콘솔 어디서도 노출 안 됨**. 노션 문서는 `source='knowledge_store'` 하드코딩(REQ-260828 C2)이라 출처 필터로도 구분 불가.
- 문서 단위 변경 이력(kb_revisions)·감사 열람 화면(/audit)은 있으나 소스 관점 절단면이 없음.

## 2. TO-BE — 소스 상세 "전환 내역" (신규 페이지 대신 /knowledge 내 모달)

### R1. 소스별 전환 문서 목록
- 소스 행의 이름 클릭 → **전환 내역 모달**. 상단에 소스 요약(유형·대상·마지막 동기화 결과).
- 문서 목록: 제목(클릭=기존 문서 상세로 전환)·카테고리·상태(embedded/pending)·노출·수정일, 페이지네이션.
- 서버는 기존 `GET /knowledge/documents?source_id=` 재사용(프런트 노출만). 숨김(active=0) 문서도 포함 —
  "사라진 페이지가 숨김 처리됐다"가 바로 이 화면이 답할 질문.

### R2. 동기화 실행 이력
- 같은 모달에 실행 이력 표: 실행 시각·결과(ok/failed)·created/updated/skipped/hidden(+dropped/truncated)·
  embedded·소요·실행자·**실패 사유(B1 error)**.
- 신규 `GET /knowledge/sources/:id/runs?limit=` — **감사 로그 재사용**(`knowledge.source_synced`,
  metadata.sourceId 필터). 신규 테이블 없음.
- **보강**: 실패 실행도 감사 기록(`status:'failed'`+error) — 지금은 성공만 남아 이력이 반쪽. 기록 시점부터 축적
  (과거 실패는 소급 불가 — 화면에 명시).

## 3. 사용자 플로우
1. go2joy 운영자가 노션 소스 이름 클릭 → 문서 1건(Hotel Admin 가이드)이 embedded로 등록돼 있음을 확인.
2. 실행 이력에서 8/28의 실패(미공유 404)→성공(truncated)→성공(완전 수집) 흐름과 각 사유를 시간순으로 확인.
3. 노션에서 페이지 삭제 후 재동기화 → hidden=1 실행 행 + 문서 목록에서 해당 문서가 숨김 표시로 남아 있음을 확인.

## 4. 제약·전제
- **스키마 무변경** — 감사 로그·기존 필터 재사용(적정기술). 실행 이력 보존 기간 = 감사 로그 보존 정책을 따름.
- 권한: 기존 KNOWLEDGE_SOURCE_MANAGE 그대로. 노션 외 소스(gdrive)도 동일하게 동작(소스 공통 화면).
- i18n 6언어, 테넌시 술어, 유닛(런 조회 쿼리·실패 감사 기록) 추가.
- 범위 밖(백로그): 실행 이력 전용 테이블(감사 보존과 분리가 필요해질 때), 문서별 revision 타임라인 통합 표시, C2(source 필드 구분).
