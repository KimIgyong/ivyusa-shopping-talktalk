# PLN-260829 — Smart Knowledge Board B1: 보드 코어

- 근거: `docs/analysis/REQ-260829-Smart-Knowledge-Board.md` (권고안 D-1~D-6 확정)
- B1 범위: 보드 실체·문서 CRUD·히스토리·첨부·자동 프로비저닝·목록 콘솔.
  채택/시뮬레이션(B2)·코멘트/멘션/백링크(B3)·임포트 통합(B4)은 후속.
- ⚠️ **스키마 신설 있음** — SQL 선적용(migrations:manifest 재생성 포함)

## 0. 설계 결정

| # | 결정 | 내용 |
|---|---|---|
| B1-1 | 신규 도메인 모듈 | `apps/api/src/domain/board/` — knowledge 모듈에 얹지 않음(이미 20+ 서비스). 에러 블록 **E5071~** 신규 할당 |
| B1-2 | 테이블 4종 | `boards`(테넌트당 기본 1행) · `board_documents` · `board_document_revisions`(kb_document_revisions 동형) · `board_attachments`(파일+**구글드라이브 링크를 kind='link'로 통합**) . 태그는 문서의 `tags JSON`(별도 테이블은 과설계), 위키링크 파싱 결과도 `links JSON`으로 저장만(소비는 B3) |
| B1-3 | 기본 보드 프로비저닝 | **lazy ensure**(보드 API 첫 호출 시 없으면 생성 — 신규 테넌트 훅 누락 위험 0) + 마이그레이션 SQL이 기존 테넌트 전체 백필 INSERT. 요구 "모든 테넌트 기본 1개" 충족 |
| B1-4 | 문서 필드 | 그룹(doc_group, KB와 동일 값) · 1차/2차 분류(varchar64, 2차 null 허용) · 제목 · 작성팀(`job_labels` 코드 재사용) · 작성자/수정자/작성·수정일 · 본문(**Markdown 원문 저장**, D-5) · tags/links JSON · 상태 `draft|published`(promoted/rejected 값은 B2에서 사용 — enum만 선정의) |
| B1-5 | 에디터 | `@uiw/react-md-editor`(툴바형 위지위그 + 실시간 프리뷰, MD 원문 저장) — 완전 HTML 리치는 D-5에서 기각됨. 이미지 업로드 → 첨부 저장 → MD에 서명 URL 삽입 버튼 |
| B1-6 | 첨부 | 50MB/파일 · 9종(`pdf docx xlsx csv png jpg webp zip rar`) · 멀티 업로드(요청당 10개) · 저장 `UPLOAD_DIR/board/{tenantId}/` · 조회는 **기존 첨부 서명 URL 유틸 재사용**(프리뷰 `<img>`가 인증 헤더를 못 실으므로). zip/rar는 보관·다운로드만(분석 없음, C8) |
| B1-7 | 콘솔 진입 | 신규 사이드바 메뉴를 만들지 않고 **기존 `knowledge` 메뉴 스코프**(`@RequireMenu('knowledge')`) 아래 라우트 `/knowledge/board` — 제공메뉴/팀원권한 매트릭스 무변경(2계층 메뉴 시스템 리스크 회피). /knowledge 상단에 보드 진입 배너 |
| B1-8 | 권한 | 조회·작성: `knowledge` 메뉴 접근자 전원(작성팀 개념상 상담원도 씀). 삭제: 작성자 본인 또는 master/director. KB 채택 권한은 B2에서 `KNOWLEDGE_SOURCE_MANAGE` |
| B1-9 | 삭제 | 소프트 상태 없이 하드 삭제 + 리비전은 삭제 전 스냅샷(kb 문서 삭제와 동일 패턴). 첨부 파일도 삭제 |
| B1-10 | 구 테이블 | `kb_board_posts` **드랍**(코드 경로 0·스테이징 0행 확인 완료) — 같은 마이그레이션에 포함 |

## 1. 스키마 (`sql/migration_smart_knowledge_board.sql`, 멱등)

```sql
boards                    id·tenant_id·name(v128, 기본 'Smart Knowledge Board')·created_at
                          UNIQUE (tenant_id)                       -- 테넌트당 1개(확장 시 축 완화)
board_documents           id·tenant_id·board_id·doc_group(v16)·category1(v64)·category2(v64 N)
                          ·title(v255)·team_label(v32 N)·content(longtext)·tags(JSON N)·links(JSON N)
                          ·status(v16 'draft')·author_user_id·updated_by(N)
                          ·promoted_document_id(bigint N)          -- B2 소비, 컬럼만 선포함
                          ·created_at·updated_at
                          INDEX (tenant_id, board_id, doc_group) · FULLTEXT ngram(title, content)
board_document_revisions  id·tenant_id·document_id·revision_no·title·content·category1·category2
                          ·changed_fields(JSON)·change_kind(v16)·actor_user_id·created_at
                          UNIQUE (document_id, revision_no)
board_attachments         id·tenant_id·document_id·kind(v8 'file'|'link')·filename(v255)
                          ·mime(v128 N)·storage_path(v512 N)·size(bigint N)·url(v1024 N)
                          ·created_by·created_at   INDEX (tenant_id, document_id)
-- 백필: INSERT INTO boards (tenant_id, name) SELECT id, 'Smart Knowledge Board' FROM tenants ...
-- DROP TABLE IF EXISTS kb_board_posts;  (B1-10)
```

## 2. 백엔드 (`domain/board/`)

- 엔티티 4종(널 컬럼 명시 type — 부팅사 함정 준수) · `board.service.ts`(ensureDefault,
  문서 CRUD+리비전 기록+위키링크 파싱 저장, 목록: 그룹/분류/태그/검색/페이지네이션
  `Paginated`) · `board-attachment.service.ts`(업로드 검증·저장·서명 URL·삭제)
  · `board.controller.ts`(thin) · mapper · dto(요청 snake/응답 camel) · module → app.module 등록.
- 라우트: `GET/POST /board/documents` · `GET/PATCH/DELETE /board/documents/:id`
  · `GET /board/documents/:id/revisions(+/:revId)` · `POST /board/documents/:id/attachments`
  (multer 50MB·files 10) · `DELETE /board/attachments/:id` · `POST .../attachments/link`.
- 에러: `E5071` 미지원 첨부 형식 · `E5072` 첨부 개수 초과 · `E5073` 링크 URL 불량.
- 테스트: ensureDefault 멱등·레이스, CRUD+리비전, 첨부 검증(9종·50MB·개수), 위키링크
  파싱, 타 테넌트 404.

## 3. 콘솔 (`apps/web/src/domain/board/`)

- 라우트 `/knowledge/board`(목록) · `/knowledge/board/:id`(상세/편집).
- 의존성: `@uiw/react-md-editor`(apps/web).
- 목록: 그룹 탭(기존 `group.*` 라벨) → 1차 분류 사이드 내비(2차는 하위 접기) → 테이블
  (제목·작성팀·작성자·수정일·태그 칩·상태 뱃지) · 검색 · 태그 필터 · [+ 새 문서].
- 상세/편집: 메타(그룹·1차/2차 분류·작성팀 셀렉트(job_labels)·태그 입력) + MD 에디터
  + 첨부 패널(드래그 멀티 업로드·링크 추가·이미지 [본문 삽입]) + 히스토리 탭(리비전
  목록·보기·복원) . 저장 토스트 규약 준수.
- /knowledge 페이지 상단에 보드 진입 카드("지식은 보드에서 시작합니다" — B2에서 채택
  플로우로 연결).
- i18n 6개 로케일(신규 네임스페이스 `board`).

## 4. UI 와이어프레임

```
/knowledge/board  ─ Smart Knowledge Board
┌────────────────────────────────────────────────────────────────────┐
│ [CounselInfo] [ProductInfo] [OperationInfo]     검색[____] [+ 새 문서]│
│ ┌1차 분류──────┐ ┌──────────────────────────────────────────────┐  │
│ │ ▾ 환불·교환 12│ │ 제목            팀     작성자   수정일  상태  │  │
│ │    · 정책  8  │ │ 환불 7일 정책   상담   김지원   8/29   draft │  │
│ │    · 예외  4  │ │ VIP 응대 규칙   운영   이서연   8/28   게시  │  │
│ │ ▸ 배송     9  │ │ …                                            │  │
│ │ #태그: 환불 vip│ └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘

/knowledge/board/:id  ─ 문서 편집
┌────────────────────────────────────────────────────────────────────┐
│ 그룹[Counsel▾] 1차[환불·교환▾] 2차[정책▾] 팀[상담▾] 태그[환불 ×][+] │
│ 제목 [환불 7일 정책_____________________________]   [히스토리(4)]   │
│ ┌─ MD 에디터(툴바: B I 링크 표 이미지 [[문서링크]]) ─┬─ 프리뷰 ──┐ │
│ │ 주문 후 **7일 이내** 미개봉 상품은…                │ (렌더)     │ │
│ └────────────────────────────────────────────────────┴───────────┘ │
│ 첨부: [정책원본.pdf 2.1MB ×] [규정.xlsx ×] [GDrive: 링크 ×] [+파일][+링크]│
│                        상태: draft   [게시]  [저장]   (채택은 B2)   │
└────────────────────────────────────────────────────────────────────┘
```

## 5. 측면 영향·리스크

| 영역 | 영향 | 대응 |
|---|---|---|
| 기존 KB 흐름 | B1은 **완전 병행**(어느 경로도 변경 없음) — 직행/인제스트/동기화 그대로 | 채택·동선 개편은 B2/B3 |
| 스키마 | 신규 4테이블+kb_board_posts 드랍 | SQL 선적용·manifest 재생성·롤백=신규 드랍(드랍 복원은 백업) |
| 업로드 볼륨 | 50MB×다수 — 스테이징 디스크 | UPLOAD_DIR 동일 볼륨, 용량은 운영 모니터링(기존 첨부와 동일 정책) |
| 에디터 의존성 | @uiw/react-md-editor 번들 증가 | 보드 라우트 lazy import |
| 메뉴 권한 | 무변경(knowledge 스코프 재사용, B1-7) | — |
| FULLTEXT | board_documents ngram — 검색 LIKE 폴백 없이 기존 KB와 동일 패턴 | — |

검증: 단위+실부팅+로컬 CRUD/첨부/리비전 스모크 → 스테이징 SQL 선적용→배포→백필
확인(전 테넌트 boards 1행)→콘솔 육안. TCR/RPT 후속.

---
**승인 요청**: B1-1~B1-10 포함 본 계획으로 구현 진행 여부를 확인해 주세요.
