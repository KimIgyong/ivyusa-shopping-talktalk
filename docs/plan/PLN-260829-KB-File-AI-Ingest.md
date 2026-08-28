# PLN-260829 — 지식 페이지 3차: 파일 AI 인제스천(R4) + YouTube 영상 지식화 P1(R5)

- 근거: `docs/analysis/REQ-260829-Knowledge-Page-Enhancements.md` R4·R5
  (확정: D4-1 미리보기 승인 저장 · D4-2 kb_files 원본 보관 · D4-3 200K자 상한 · D5-1 P1=YouTube 자막만)
- 스키마 변경 **없음**(kb_files 기존 테이블 재활용 — 컬럼 그대로)

## 0. 설계 결정 (승인 시 확정)

| # | 결정 | 선택안 (권고) | 근거 |
|---|---|---|---|
| P3-1 | 파이프라인 형태 | **비동기 잡**: `POST /knowledge/ingest` → 202+jobId → `GET /knowledge/ingest/status` 폴링(추출→분석→초안) → `POST /knowledge/ingest/approve`(선택 초안 저장) | LLM 분석은 수 분 — nginx 60초 교훈. 카탈로그 동기화 잡 패턴 재사용 |
| P3-2 | 추출 라이브러리 | pdf→`pdf-parse`, docx→`mammoth`(신규 2종, api 전용) · xlsx→기존 exceljs · csv→기존 csv.util | 텍스트 레이어 추출만. 스캔 PDF(OCR)는 범위 외 — 추출 0자면 명확한 오류 |
| P3-3 | AI 분할 | 신규 `AI_FUNCTION.INGEST` 라우팅으로 `complete()` 호출. 텍스트를 ~12K자 청크로 순회하며 JSON 아티클 배열(제목/카테고리 제안/본문) 산출. 기존 그룹 카테고리 목록을 프롬프트에 제공해 우선 매핑 | 함수 라우팅 미설정 테넌트는 기본 엔진 폴백(기존 동작) — 시드/SQL 불필요 |
| P3-4 | **파싱 실패 폴백** | LLM 출력이 JSON으로 안 읽히는 청크는 **청크 전체를 아티클 1건 초안**으로 격하(제목=파일명+순번) | 실패가 "초안 0건"으로 증발하지 않게 — 검수 게이트가 있으므로 저품질 초안도 안전 |
| P3-5 | 검수 게이트 | 초안 목록 모달: 체크박스 선택 + 제목/카테고리 인라인 수정 + 본문 펼쳐보기 → [승인 저장] 시에만 kb_documents 생성(active:1, pending→배치 임베딩) | D4-1 확정. AI 산출물 무검수 지식화 금지(지식 폐루프 원칙) |
| P3-6 | 원본 보관·출처 | 업로드 파일은 첨부 스토리지 경로에 저장 + `kb_files` 행(tenant, filename, mime, storage_path, size). 생성 문서: `source='file_upload'`, `external_key=FILE-{fileId}-{n}`(재승인 시 갱신 멱등), source_url=원본 다운로드 경로 | D4-2 확정. kb_files 첫 실사용 |
| P3-7 | 상한 | 파일 15MB · 추출 텍스트 200K자(초과분 절단 + 결과에 `truncated` 표기) · 초안 최대 100건/파일 | D4-3 확정. 절단은 오류가 아니라 고지 |
| P3-8 | 영상 P1 | 같은 모달의 "영상 URL" 탭: YouTube URL → 공개 자막(수동→자동 순) 추출 → **동일 파이프라인**(P3-3 이후 공유). 자막 없으면 명확한 오류. `source='youtube'`, source_url=영상 URL | D5-1 확정. 신규 인프라 0 — 자막 추출 실패는 사유 분리 |
| P3-9 | 에러코드 | E5066~E5070 신규: 미지원 파일 / 추출 실패(스캔 PDF 등) / 추출 결과 빈 텍스트 / 잡 중복 실행 / 자막 없음·영상 접근 불가 | 사유 분리 원칙(PR #281 계열) |
| P3-10 | 잡 상태 보존 | 초안은 잡 스토어(메모리, 테넌트당 1잡, 최근 결과 유지)에만 — 승인 전 서버 재시작 시 초안 소실은 재분석으로 복구(원본은 kb_files에 있음) | 카탈로그 잡과 동일 트레이드오프. 초안 영속화는 과설계로 보류 |

## 1. 단계별 계획

### S1 — 추출 계층 (apps/api)
- `file-extract.util.ts`(신규): mime/확장자별 텍스트 추출(pdf-parse·mammoth·exceljs·csv.util),
  200K자 절단+truncated 플래그, 실패 사유 코드화. 의존성 `pdf-parse`·`mammoth` 추가.
- `youtube-transcript.util.ts`(신규): watch 페이지에서 자막 트랙 URL 파싱 → 자막 텍스트
  (수동 우선, 자동(asr) 폴백). 외부 HTML 구조 의존 — 실패 시 E5070으로 명확히.
- 단위 테스트: 각 포맷 픽스처(소형 pdf/docx 바이너리 커밋), 절단, 실패 코드.

### S2 — 인제스트 잡 (apps/api)
- `knowledge-ingest.service.ts` + `knowledge-ingest-job.service.ts`(신규, 카탈로그 잡 패턴):
  단계 progress(extracting→analyzing n/m→ready), 초안 배열 보관, 테넌트당 1잡(E5069).
- AI 분할: `AI_FUNCTION.INGEST` 신설, 청크 순회 → JSON 파싱(P3-4 폴백), 카테고리 매핑
  프롬프트에 해당 그룹 카테고리 목록 주입.
- 라우트(전부 `KNOWLEDGE_SOURCE_MANAGE`):
  `POST /knowledge/ingest`(multipart file+doc_group | body video_url+doc_group, 202) ·
  `GET /knowledge/ingest/status` · `POST /knowledge/ingest/approve`(선택·수정된 초안 배열).
- 승인 저장: kb_files 행 연결, ensure(category, group), 문서 생성(pending) →
  `embedDocuments` 배치 → 감사 `knowledge.file_ingested`(파일명·초안/승인 수).

### S3 — 콘솔 (apps/web)
- KB-Documents 툴바에 **[AI 임포트]** 버튼(모든 그룹 탭+전체 탭 노출 — 모달에서 그룹 선택).
- 모달: ① 소스 선택(파일 업로드 | 영상 URL) + 그룹 Select(상담매뉴얼/상품추천/운영매뉴얼
  라벨은 기존 `group.*` 병기) ② 진행 표시(폴링, 단계+청크 진행) ③ 초안 목록(체크박스·
  제목/카테고리 수정·본문 접기) ④ [선택 저장] → 결과 토스트(저장 n·임베딩 n).
- i18n 6개 언어, UX 토스트 규약 준수.

### S4 — 검증·배포
- Jest(추출·분할 파싱·잡 상태·승인 저장) + 전체 회귀 + typecheck + i18n + 실부팅.
- 로컬 스모크: stub LLM 환경 → P3-4 폴백 경로(전체 1건 초안)로 E2E 성립 확인.
- 스테이징(실 LLM): 실제 pdf 매뉴얼 업로드 → 초안 품질 확인 → go2joy로 검증,
  YouTube 자막 영상 1건 E2E. SQL 없음(매니페스트 불변).
- TCR/RPT. **의존성 추가로 API 이미지 재빌드 확인**(node_modules 레이어).

## 2. UI 와이어프레임

```
[KB-Documents 툴바]  … [Bulk import] [AI 임포트] [Add KB-Document]

[AI 임포트 모달 — 1단계]
┌─ AI 임포트 ────────────────────────── ✕ ─┐
│ 지식그룹  [CounselInfo(상담매뉴얼) ▼]      │
│ ┌─(파일)──────────┐ ┌─(영상 URL)───────┐  │
│ │ pdf/docx/xlsx/csv│ │ YouTube URL 입력 │  │
│ │  (최대 15MB)     │ │ [_____________]  │  │
│ └─────────────────┘ └──────────────────┘  │
│                        [취소] [분석 시작]  │
└───────────────────────────────────────────┘
[2단계 — 진행]   추출 완료 → AI 분석 중 (청크 3/7) ▓▓▓░░
[3단계 — 초안 검수]
│ ☑ 환불 정책 안내      [카테고리: faq ▾]  ▸본문   │
│ ☑ 배송 기간 안내      [카테고리: 배송 ▾] ▸본문   │
│ ☐ (저품질 초안 — 해제) …                        │
│ ⚠ 원문 200K자 초과분은 절단되었습니다(해당 시)   │
│                       [취소] [선택 2건 저장]     │
```

## 3. 측면 영향

| 영역 | 영향 | 대응 |
|---|---|---|
| 스키마 | 없음(kb_files 기존 테이블 첫 사용) | 마이그레이션·매니페스트 불변 |
| AI 비용 | 파일당 최대 ~17청크 LLM 호출 | 상한(200K자)+테넌트 AI 사용량 계측이 게이트웨이에서 자동 계상 |
| 모더레이션 | 저장 문서는 outbound 아님 — 인용 시점 기존 게이트 적용 | 무변경 |
| 기존 임포터 | 무변경(상품 CSV·일괄등록과 병존 — 용도 구분: 구조화 표 vs 비정형 문서) | 모달 문구로 안내 |
| YouTube 의존 | 페이지 구조 변경 시 자막 추출 깨질 수 있음 | E5070 사유 분리 + util 격리(교체 용이) |
| 임베딩 30K 컷 | 아티클 분할이 자연 해결 — 초안 본문 25K자 초과 시 경고 표시 | 검수 화면 고지 |

## 4. 리스크

- LLM JSON 불안정 → P3-4 폴백으로 기능 성립 보장(품질은 검수 게이트가 방어).
- pdf-parse 스캔본 0자 → E5067 "텍스트 없음(스캔 문서로 보임)" 안내.
- 메모리 잡 스토어: 대형 초안 보관 — 초안 100건×25K자 ≈ 2.5MB/테넌트 상한 내.

---
**승인 요청**: P3-1~P3-10 포함 본 계획으로 구현 진행 여부를 확인해 주세요.
