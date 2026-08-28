# REQ-260829 — 지식 페이지 기능 개선 5종 요구사항 분석

- 작성일: 2026-08-29
- 요청 유형: [요구사항] — 기존 기능 검토 후 개선 제안 + 미구현 기능 요구사항 구체화
- 대상: `https://shoptalk.amoeba.site/knowledge` (콘솔 지식 페이지)
- 분석 근거: 코드 전수 탐색(2026-08-29) + 스테이징 실데이터 조회

---

## R1. 소스(Sources) 관리 — 삭제 부재 · board 존폐 · 자격증명 UI 압축

### AS-IS
- **삭제 UI 없음**: 소스 테이블(`KnowledgePage.tsx:445-552`)의 액션은 이력 모달·상태
  토글(active/inactive)·동기화(↻)뿐. 이름 변경·designated 토글·삭제 없음.
  프런트에 delete 클라이언트 자체가 없음(`knowledge.service.ts:332-349`).
- **백엔드 `DELETE /knowledge/sources/:id`는 존재하나 위험**(`knowledge.service.ts:151-154`):
  단순 행 삭제 — 문서 무처리·Qdrant 무처리·감사 무기록. `kb_documents.source_id`는 FK 없는
  bigint라 **고아 문서가 active로 영구 검색 대상에 잔류**하고, designated 제외 서브쿼리
  (`rag.service.ts:331-334`)로는 다시는 제외할 수 없게 됨. 이력 모달도 접근 불능.
- **board**: 어댑터 자체가 제거된 상태(`source-sync.service.ts:62-78` — "글 쓸 화면이 없어
  모든 board 소스는 태생적으로 비어 있었다"). `createSource`는 board/repository를 이미 거부.
  스테이징 실데이터: board 소스 5행(테넌트 1·4) 전부 **동기화 이력 NULL, `kb_board_posts` 0행**.
  엔티티·테이블(`kb_board_posts`)은 등록만 되고 코드 경로 0 (PLN-260826에서 드랍 제안 이력).
  `repository` 타입도 동일(미지원 잔존 1행).
- **자격증명 UI**: Google Drive/Notion이 `SourceCredentialCard` 2장을 `md:grid-cols-2`
  그리드로 배치(`KnowledgePage.tsx:674-725`) — 세로 공간을 크게 차지. 동일 정보가
  소스 추가 모달 안에도 경고 박스로 중복 노출(`:1527-1545`, `:1561-1578`).

### TO-BE / 개선 제안
1. **소스 삭제 액션 추가** — 단, 백엔드를 먼저 보강:
   삭제 시 해당 소스의 문서 처리 방식을 함께 결정(권고: **문서 일괄 비활성화**(active=0,
   Qdrant setActive) 후 소스 행 삭제 + 감사 기록. 문서까지 지울지는 확인 모달에서 선택).
2. **board 정리(권고: 폐기 확정)** — 실사용 0이 데이터로 확인됨. 범위:
   (a) 죽은 소스 행 6건(board 5+repository 1) 정리 — 신설되는 삭제 기능으로 운영자가 제거,
   (b) DTO enum에서 board/repository 제거(legacy 행 표시는 유지),
   (c) `kb_board_posts` 테이블·엔티티·`kb_files`(역시 0행·코드 경로 0) 드랍은 **별도 PR**
   (스키마 변경 — R4에서 kb_files 재활용 여부 결정 후).
3. **자격증명 한 줄 처리**: 카드 2장을 접이식 한 줄 행(provider 아이콘 + 연결 상태 뱃지 +
   [키 등록/테스트/삭제] 버튼)으로 압축한 `1열×2행` 리스트로 변경. 미연결 시에만 입력영역 확장.
   소스 추가 모달 내 중복 안내는 자격 미연결일 때만 축약 표시.

### 결정 필요
- **D1-1**: 소스 삭제 시 문서 기본 처리 = 비활성화(권고) vs 완전 삭제 vs 그대로 두기.
- **D1-2**: board/repository의 DTO enum 제거 + 죽은 행 정리까지 이번 범위에 포함할지.

---

## R2. 카테고리 관리 — 그룹별 탭 + 그룹별 에이전트 지정

### AS-IS
- `CategoryManagerCard`는 그룹 구분 없이 전 카테고리를 한 목록(수동/카탈로그 2분할)으로 표시.
  액션: 이름변경·숨김·삭제(문서 0일 때)·병합·추가·에이전트 지정. (서버에 reorder API가
  있으나 UI 없음 — 부수 갭.)
- **`kb_categories`에 그룹 축이 없음**: 유니크 `(tenant_id, name)`, `agent_ids`는 카테고리
  "이름" 전역으로 적용. RAG 제외 서브쿼리(`rag.service.ts:346-356`)와 답변 재사용
  (`answer-reuse.service.ts:49`)도 그룹 무인지.
- KB-Documents 카드는 그룹 탭이 있으나(전체/Counsel/Product/Operation) 카테고리 관리와 단절.
- 스테이징 실데이터: **여러 그룹에 걸친 카테고리 0건** → 그룹 축 추가 마이그레이션이
  데이터 충돌 없이 가능.

### TO-BE
- 카테고리 관리 카드에 **KB-Documents와 동일한 그룹 탭**(전체/Counsel/Product/Operation)
  추가. 탭 선택 시 해당 그룹의 카테고리만 목록·관리.
- **스키마**: `kb_categories.doc_group VARCHAR(16) NOT NULL DEFAULT 'counsel'` 추가,
  유니크를 `(tenant_id, doc_group, name)`으로 변경, **백필**은 각 카테고리 이름이 실제로
  붙어 있는 문서의 그룹으로(카탈로그 origin=product 고정, 무문서 카테고리=counsel).
- **에이전트 지정 그룹 인지화**: `agent_ids` 적용을 (그룹, 카테고리명) 단위로 —
  RAG 제외 서브쿼리에 `kb.doc_group = c.doc_group` 조인 조건 추가, 답변 재사용 동일.
- 카테고리 추가/이름변경/병합은 활성 그룹 탭 안에서 동작(그룹 간 병합은 범위 외).

### 측면 영향(주요)
- SQL 마이그레이션 필수(스테이징 `DB_SYNCHRONIZE=false` — 선적용 런북 대상).
- `ensure()` 호출부 전원(카탈로그 동기화·일괄등록·소스 동기화)에 그룹 전달 필요.
- 문서의 그룹이 바뀌는 경로는 현재 없음(수정 DTO 미지원)이라 정합성 유지 부담 낮음.

### 결정 필요
- **D2-1**: 스키마 변경(유니크 축 변경 + 백필) 승인 여부 — 본 요구의 전제.

---

## R3. Add KB-Document 그룹 선택

### AS-IS
- 모달 필드: 제목·카테고리(datalist)·내용뿐. 그룹은 **활성 탭에서 암묵 결정**
  (전체 탭=counsel 기본, PLN-260828 D8) — 화면에 보이지 않아 오등록 인지 불가.

### TO-BE
- 모달에 **그룹 Select 추가**(CounselInfo/ProductInfo/OperationInfo), 기본값=활성 탭
  (전체 탭이면 counsel). 카테고리 datalist도 선택 그룹의 카테고리로 필터(R2와 연동).
- 소규모 변경: DTO는 이미 전 그룹 허용 — 프런트만.

---

## R4. 파일 업로드 → AI 분석 → 지식문서 생성 (신규 기능)

### AS-IS (전무에서 출발)
- 파일 업로드 경로는 상품 CSV·일괄등록 CSV/XLSX 2종뿐(구조화 표 데이터 전용, AI 무관여).
- **pdf/docx 파싱 라이브러리 0개**. gdrive/notion 동기화도 텍스트 네이티브 포맷만 추출
  (Drive: Google Docs·txt·md만, **PDF/DOCX는 skipped**; Notion: 파일 블록 미다운로드).
- AI 게이트웨이 능력 = complete/embed뿐. 장문 분할·요약 인제스천 파이프라인 없음.
  임베딩은 문서당 1건, 30K자 하드컷.
- `kb_files` 테이블·엔티티가 미사용 상태로 존재(0행) — 원본 보관 저장소로 재활용 후보.

### 요구사항 정의 (TO-BE)
**흐름**: 파일 업로드(pdf/docx/xlsx/csv) → 지식그룹 선택(상담매뉴얼=counsel /
운영매뉴얼=operation / 상품추천용=product) → AI 내용 파악·아티클 분할 → 초안 검수 →
지식문서 저장·임베딩.

1. **업로드**: `POST /knowledge/documents/import/file` (multipart, 확장자
   `.pdf|.docx|.xlsx|.csv`, 15MB/1파일, `doc_group` 필드). 원본은 `kb_files`에 보관
   (재분석·출처 추적, `storage_path`는 첨부 파이프라인의 스토리지 재사용).
2. **텍스트 추출**: pdf→`pdf-parse`(텍스트 레이어; 스캔본 OCR은 범위 외·오류 안내),
   docx→`mammoth`, xlsx→`exceljs`(기존), csv→기존 `csv.util`. 추출 실패는 사유 분리
   에러코드(신규 Exxxx 블록).
3. **AI 분석**: `AiGatewayService.complete`(신규 AI function `ingest` 라우팅)로
   ① 문서 개요 파악 → ② **작업/주제 단위 아티클 분할**(go2joy 변환기에서 검증한
   `제목→카테고리 제안→본문` 구조) → ③ 카테고리는 기존 카테고리 목록을 프롬프트에 제공해
   우선 매핑, 없으면 신규 제안. 장문은 청크 순회 요약-병합(30K 임베딩 컷을 분할이 자연 해결).
4. **비동기 작업**: LLM 분석은 수 분 소요 → 카탈로그 동기화의 202+폴링 잡 패턴
   (`catalog-sync-job.service`) 재사용. nginx 60초 타임아웃 교훈 준수.
5. **검수 게이트(권고)**: 분석 결과를 **초안 목록 미리보기 모달**(아티클별 제목/카테고리/
   본문, 체크박스 선택·수정 가능) → [승인 저장] 시에만 kb_documents 생성(active:1,
   pending→배치 임베딩, `source='file_upload'`, source_url=원본 파일 참조, 감사 기록).
   — AI 산출물을 무검수로 지식화하지 않음(지식 폐루프의 human-approval 원칙과 일치).
6. **멱등/재분석**: 같은 파일 재업로드 시 새 분석 잡(문서 업서트 아님 — 검수 게이트가
   중복을 통제). 아티클에 external_key 자동 부여(`FILE-{fileId}-{n}`)로 재저장 갱신 지원.

### 결정 필요
- **D4-1**: 검수 게이트 방식 = 미리보기 승인 저장(권고) vs 자동 저장 후 active:0 검수.
- **D4-2**: 원본 파일 보관(kb_files 재활용, 권고) vs 미보관(분석 후 폐기).
- **D4-3**: AI 분석 비용 통제 — 파일당 페이지/자수 상한(권고: 텍스트 200K자·초과분 절단 안내).

---

## R5. 영상 경로 입력 → 분석 → 지식문서 저장 (신규 — 타당성 검토)

### AS-IS
- 영상·음성·STT·자막 관련 코드 0. AI 게이트웨이에 transcribe 능력 없음(complete/embed뿐).

### 타당성 및 단계 제안
| 단계 | 범위 | 방식 | 난이도/비용 |
|---|---|---|---|
| **P1 (권고 선행)** | YouTube URL | 공개 자막/트랜스크립트 추출 → R4의 텍스트 분석 파이프라인 재사용(그룹 선택 동일) | 낮음 — 신규 인프라 없음. 자막 없는 영상은 불가 안내 |
| P2 | 임의 영상 URL/파일 | AI 게이트웨이에 **transcribe 어댑터 신설**(예: OpenAI Whisper API — openai 어댑터 존재) → 오디오 추출(ffmpeg 도입 필요) → STT → 텍스트 파이프라인 | 중 — ffmpeg 컨테이너 의존성 + STT 과금 + 대용량 처리 시간 |
| P3 | 화면 내용(슬라이드·시연) 이해 | 프레임 샘플링 + 멀티모달 분석 | 높음 — 보류 권고 |

- **요구 형태 제안**: R4의 업로드 모달에 "영상 URL" 입력 탭 추가(그룹 선택 공유).
  P1만으로도 "교육 영상 → 운영지식" 시나리오의 상당 부분 충족.
- **결정 필요 D5-1**: P1(YouTube 자막)만 우선 구현할지, P2(STT)까지 로드맵에 넣을지.
  P2는 STT 제공자 선정·과금 한도 정책(테넌트별 AI 사용량 계측 연동)이 선결.

---

## 우선순위·규모 제안

| 항목 | 규모 | 스키마 | 제안 순서 |
|---|---|---|---|
| R3 그룹 선택 | XS(프런트만) | 없음 | 1 (즉시) |
| R1 소스 삭제+board 정리+자격 UI | S~M | 없음(테이블 드랍은 별도) | 2 |
| R2 카테고리 그룹화 | M(스키마+RAG 쿼리) | **필요** | 3 |
| R4 파일 AI 인제스천 | L(신규 파이프라인) | kb_files 활용 | 4 |
| R5 영상 P1 | M(R4 위에 증축) | 없음 | 5 (R4 후속) |

- 부수 갭(범위 외 기록): 카테고리 reorder API의 UI 부재, `kb_files`/`kb_board_posts`
  드랍 여부, 소스 삭제 API의 현재 위험(문서 고아화)은 R1에서 함께 해소.

---
**다음 단계**: D1~D5 결정 확인 → 항목별 PLN(승인) → 구현. R3+R1을 1차 PLN,
R2를 2차, R4(+R5 P1)를 3차로 분리 제안.
