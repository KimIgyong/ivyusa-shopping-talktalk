# TCR-260829 — Smart Knowledge Board B4(임포트 통합) 테스트

- 근거: `docs/plan/PLN-260829-Smart-Knowledge-Board-B4.md`

## 1. 단위 테스트 (전체 178 suites / 1,786 green)

**신규 `board-import.service.spec.ts` (5)**
- published+`faq-import` 태그+category1 기본 'FAQ' 생성, 감사 `board.faq_imported`
- 중복 제목 skip: 기존 보드 문서 + **같은 파일 내 반복** 모두
- 행 오류(제목/본문 공백)는 해당 행만 invalid — 나머지 정상 생성, errors[] 행번호
- 필수 컬럼(title/content) 누락 → E5063, 생성 0
- 미지원 확장자 E5061 · CP949 CSV E5062 (일괄등록 코드 재사용)

**`board-attachment.service.spec.ts` +2**
- `attachSharedCopy`: writeFile **1회**·문서 수만큼 행·storage_path 공유·uuid 상이
- 공유 삭제 가드(P6-7): 2행 중 1행 삭제 → unlink 안 함, 마지막 삭제 → unlink 1회

**`knowledge-ingest.service.spec.ts` +3 (생성자 attachments 의존성 추가 반영)**
- 파일 소스 승인: 실제 임시 원본 읽어 `attachSharedCopy` 1회 호출(ids 전체, 버퍼) → `attachedOriginals=2`
- 유튜브 소스 승인: 문서마다 `addLink(url, label)` — attachSharedCopy 미호출
- 첨부 실패(원본 유실)는 warn만 — 승인 결과 saved 유지, attachedOriginals=0

## 2. 통합 (로컬 실서버 :3107, `successfully started`)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | `POST /board/import` 샘플 CSV → parsed 3/created 3 | ✅ |
| I2 | 같은 내용 XLSX 재업로드 → created 0/**skipped 3** (중복 안전장치, 두 파서 왕복) | ✅ |
| I3 | 인제스트 파일 시작→승인(2문서 분할) → `attachedOriginals: 2`, board_attachments 2행이 **동일 storage_path** 공유 | ✅ |
| I4 | 문서7 삭제 → 실파일 유지(참조 잔존) / 문서8 삭제 → 실파일 unlink | ✅ |
| I5 | typecheck 9/9 · i18n 6로케일 complete · 전체 빌드 | ✅ |

## 3. UI 구현 확인 (스테이징 육안은 RPT에)

- 보드 목록 헤더 [FAQ 임포트] 버튼 → 모달: 그룹 Select·CSV/엑셀 샘플 다운로드·
  컬럼 안내·중복 스킵 안내·업로드·결과 4통계+행 오류 목록.
- AI 임포트 모달: 승인 완료 시 닫히지 않고 완료 상태 + **[보드에서 보기]** 버튼
  (`/knowledge/board` 이동).
- 문서 상세 첨부 패널: 변경 없음 — 공유 첨부도 원본 파일명으로 표시.

## 4. 스테이징 검증 계획 (RPT에 기록)

1. 스키마 변경 없음 → 머지 후 바로 배포, `/board/import` 401 확인.
2. go2joy: FAQ 샘플 임포트(생성→재업로드 스킵) + 인제스트 승인 문서에서 원본
   첨부 열림 확인.
3. 콘솔 육안: FAQ 임포트 모달·AI 임포트 완료 CTA 스크린샷.
