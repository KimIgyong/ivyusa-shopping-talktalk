# RPT-260829 — Smart Knowledge Board B4: 임포트 통합 (FAQ/Q&A → 보드 · 원본 연결)

- 요구/계획/테스트: `REQ-260829-Smart-Knowledge-Board.md` → `PLN-…-B4.md`(승인) → `TCR-…-B4.md`
- **PR #450** (squash) — main `40e62ba`, 2026-08-29. **스키마 변경 없음** — 머지 후 즉시 배포
- **B4 완료로 Smart Knowledge Board 로드맵(B1~B4) 전체 완결**

## 1. 무엇이 만들어졌나

1. **FAQ/Q&A 임포트** (`POST /board/import`): 기존 게시판/헬프데스크의 CSV·XLSX
   내보내기(title/content 필수, category1·category2·tags 선택)를 게시 상태 보드
   문서로 일괄 생성. `faq-import` 태그 자동, category1 기본 'FAQ', **중복 제목
   skip**(재업로드 안전), 5MB·5,000행·E5061~65 코드 및 파서(일괄등록) 재사용,
   감사 `board.faq_imported`. 샘플 `board-faq-import-sample.{csv,xlsx}` 제공.
2. **인제스트 원본↔보드 문서 연결**(P6-6): AI 임포트 승인 시 파일 원본을
   `board/`에 **1회 복사**하고 승인된 모든 문서가 그 storage_path를 공유하는
   첨부 행을 가짐(`attachSharedCopy`); 유튜브 소스는 문서마다 링크 첨부.
   실패는 warn(승인 불파괴), 응답에 `attachedOriginals`.
3. **공유 첨부 삭제 가드**(P6-7): `remove()`가 같은 storage_path를 참조하는
   다른 행이 남아 있으면 실파일 unlink를 보류 — 마지막 참조 삭제 시에만 unlink.
4. **콘솔**: 보드 목록 [FAQ 임포트] 모달(그룹 선택·샘플 다운로드·컬럼/중복 안내·
   결과 4통계+행 오류), AI 임포트 완료 상태 + **[보드에서 보기]** CTA, 6로케일.

## 2. 검증 결과

| 단계 | 결과 |
|---|---|
| 단위/회귀 | 신규 10케이스 · **178 suites / 1,786 green** · typecheck 9/9 · i18n complete · 빌드 |
| 로컬 스모크 | 샘플 CSV 생성3 → XLSX 재업로드 스킵3(두 파서 왕복) · 승인 2문서 attachedOriginals=2·storage_path 공유 · 문서7 삭제=파일 유지→문서8 삭제=unlink |
| 스테이징 E2E | go2joy 실 LLM: FAQ 임포트 생성3/스킵3 → 인제스트 승인 2문서 원본 첨부·서명 URL 실다운로드(407B) → 문서 하나 삭제 후에도 남은 문서 원본 다운로드 정상(공유 가드) |
| 콘솔 육안 | FAQ 임포트 모달(샘플·안내·그룹 Select), 문서 상세 첨부에 `b4-stg-ingest.csv` 원본 표시 스크린샷 확인 |
| 배포 | 머지 → 배포(SQL 없음), `successfully started`·healthy·`/board/import` 401 |

## 3. 비고

- 스테이징 유저 로그인은 `tenant_slug` 필수(`auth/user/login`) — E2E 스크립트에서
  누락 시 E1002로 오진 가능.
- 검증 잔여물 정리: FAQ 샘플 문서 3건 삭제, 인제스트 승인 문서 1건(원본 첨부
  포함)은 상시 픽스처로 유지(go2joy 보드 문서 5).

## 4. 로드맵 종결 및 후속 검토(범위 외 기록)

B1(코어)→B2(채택+시뮬레이션)→B3(협업)→B4(임포트) 완결.
후속 검토로 기록만: 멘션 벨/이메일 알림, 위키링크 자동 리라이트, 그래프 뷰,
스캔 PDF OCR·영상 STT, 카테고리 정렬 UI, gdrive/notion 동기화의 보드 경유.
