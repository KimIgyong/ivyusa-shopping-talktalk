# PLN-260829 — Smart Knowledge Board B4: 임포트 통합 (FAQ/Q&A → 보드 · 원본 연결)

- 근거: `REQ-260829-Smart-Knowledge-Board.md` — 로드맵 마지막 단계. B1~B3 완료
- **스키마 변경 없음** — 기존 board_documents/board_attachments/kb_files 활용

## 0. 설계 결정

| # | 결정 | 내용 |
|---|---|---|
| P6-1 | FAQ/Q&A 임포트 형태 | **CSV/XLSX 파일 임포트**(대부분의 게시판·헬프데스크가 CSV 내보내기 지원). 게시판 URL 크롤링은 **제외** — 사이트별 구조가 무한정이고, 비정형 소스는 기존 AI 임포트(파일/유튜브→보드)가 이미 담당 |
| P6-2 | 파일 계약 | 컬럼 `title(질문), content(답변)` 필수 + `category1?, category2?, tags?`(태그는 `;` 구분). 파서는 기존 `csv.util`/`parseXlsxRecords` 재사용(대소문자 무시·BOM·CP949 거부 — E5062~65 코드 재사용). 샘플 `public/samples/board-faq-import-sample.{csv,xlsx}` 제공 |
| P6-3 | 생성 규칙 | 보드 문서로 생성: `status='published'`(FAQ는 이미 검증된 지식 — draft 강제는 마찰만), 태그에 `faq-import` 자동 추가, category1 기본값 'FAQ'. **같은 제목이 보드에 이미 있으면 skip으로 보고**(보드 문서엔 외부 키가 없으므로 재업로드 안전장치) — 갱신이 필요하면 보드에서 직접 수정 |
| P6-4 | 한도 | 기존 일괄등록과 동일: 5MB·5,000행·행별 오류 리포트 `{parsed, created, skipped, invalid, errors[]}` |
| P6-5 | 진입점 | 보드 목록 헤더 [FAQ 임포트] 버튼 → 모달(그룹 선택+샘플 다운로드+업로드+결과). KB 직행 일괄등록(counsel/operation)은 그대로 유지(D-1) — 용도 구분을 모달 문구로 안내 |
| P6-6 | **원본 파일↔보드 문서 연결** | AI 인제스트 승인 시: ① 파일 소스는 kb_files의 원본 바이트를 **board/ 경로로 1회 복사**하고, 승인된 모든 문서가 그 storage_path를 **공유하는 첨부 행**을 가짐 ② 유튜브 소스는 각 문서에 kind='link'(영상 URL) 첨부. 문서 상세에서 원본이 바로 열림 |
| P6-7 | 공유 첨부 삭제 규칙 | `BoardAttachmentService.remove`가 unlink 전에 **같은 storage_path를 참조하는 다른 행 존재 여부를 확인** — 마지막 참조가 삭제될 때만 실파일 unlink(공유 복사본이 남의 첨부를 고아로 만들지 않게). kb-ingest의 원본(kb_files)은 감사용으로 그대로 유지 |
| P6-8 | 복사 비용 | 원본 ≤15MB × 1회 복사(문서 수와 무관) — 상한 문제 없음 |

## 1. 백엔드 작업

1. `board-import.service.ts`(신규, domain/board): `importFaq(tenantId, docGroup, file, actor)` —
   파싱(csv/xlsx)→검증(제목·본문 필수, 길이)→제목 중복 skip→BoardService.create(published,
   tags+[faq-import])→결과 집계. 감사 `board.faq_imported`.
2. `board.controller.ts`: `POST /board/import`(multipart file+doc_group, 5MB,
   기존 E5061~65 재사용) — 보드 접근자 전원 허용(작성과 동급).
3. **원본 연결(P6-6/7)**: `knowledge-ingest.service.approve` 확장 —
   파일 소스면 kb_files에서 원본 읽어 `BoardAttachmentService.attachSharedCopy(...)`
   (신규 메서드: 1회 복사+문서별 공유 행), 유튜브면 `addLink`. 실패는 warn(첨부 실패가
   승인 자체를 깨지 않게). `BoardAttachmentService.remove`에 공유 참조 가드.
4. 테스트: FAQ 파싱·중복 skip·행 오류, 공유 첨부 참조 가드(2행 중 1행 삭제 시 unlink
   안 함→마지막 삭제 시 unlink), 인제스트 승인 후 첨부 연결(파일/유튜브), 기존 회귀.

## 2. 콘솔 작업

1. 보드 목록 [FAQ 임포트] 버튼+모달: 그룹 Select·샘플 다운로드(csv/xlsx)·업로드·결과
   통계/행 오류(일괄등록 모달 패턴 재사용). i18n 6로케일.
2. AI 임포트 모달 완료 토스트에 "보드에서 보기" 동선(보드 목록 이동) 추가.
3. 문서 상세 첨부 패널: 변화 없음(공유 첨부도 일반 첨부로 표시 — 원본 파일명 유지).

## 3. UI 와이어프레임

```
[보드 목록 헤더]  [@나 2] [FAQ 임포트] [+ 새 문서]

[FAQ 임포트 모달]
┌─ FAQ 임포트 — CounselInfo ─────────────── ✕ ─┐
│ 기존 FAQ/Q&A 게시판을 CSV로 내보내 올리세요.  │
│ [⬇ CSV 샘플] [⬇ Excel 샘플]                  │
│ 필수: title(질문), content(답변)              │
│ 선택: category1, category2, tags(;구분)       │
│ 그룹 [CounselInfo ▼]                          │
│ [파일 선택 (.csv/.xlsx, 5MB·5,000행)]         │
│ ── 결과: 생성 42 · 중복 스킵 3 · 오류 1 ──    │
│ ⚠ 7행: content 누락                           │
│                     [닫기] [임포트]           │
└───────────────────────────────────────────────┘

[AI 임포트 승인 후 문서 상세 — 첨부에 원본 자동 연결]
│ 첨부: 📎 호텔운영매뉴얼.pdf (원본)  또는  🔗 https://youtu.be/… │
```

## 4. 측면 영향

| 영역 | 영향 | 대응 |
|---|---|---|
| 스키마/SQL | 없음 | manifest 불변 |
| KB 일괄등록 | 무변경 병존(용도: KB 직행 vs 보드 큐레이션) | 모달 문구로 구분 안내 |
| 첨부 삭제 | 공유 참조 가드 추가 — 기존 단독 첨부 동작 불변(참조 1 → 기존과 동일) | 신규 테스트 |
| 인제스트 승인 | 첨부 연결 추가(실패 무해) — 응답에 `attachedOriginals` 수 | 스펙 갱신 |
| 업로드 볼륨 | 원본 복사 ≤15MB/승인 1회 | 기존 정책 내 |

## 5. 리스크

- 제목 중복 skip이 "갱신 안 됨"으로 읽힐 수 있음 — 결과에 skipped를 명시 표기하고
  모달 안내("중복 제목은 건너뜁니다 — 갱신은 보드에서 직접").
- 공유 storage_path unlink 레이스(동시 삭제) — 실파일 unlink 실패는 이미 warn 무해
  (잔존 파일은 누수일 뿐 파손 아님).

---
**승인 요청**: P6-1~P6-8 포함 본 계획으로 구현 진행 여부를 확인해 주세요.
(B4 완료 시 Smart Knowledge Board 로드맵 전체 완결)
