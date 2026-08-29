# TCR-260829 — Smart Knowledge Board B1 테스트

- 근거: `docs/plan/PLN-260829-Smart-Knowledge-Board-B1.md`

## 1. 단위 테스트 (신규 2스위트 12케이스 · 전체 175 suites / 1,764 green)

**`board.service.spec.ts` (7)**: ensureDefault 멱등·**유니크 레이스 패자 회복** ·
create=리비전1+위키링크 파싱+draft 기본 · update=max+1 스냅샷+링크 재파싱 ·
promoted/rejected 상태는 편집기에서 거부(B2 전이) · 삭제 권한(작성자·director 허용,
타인 staff 거부)+삭제 스냅샷 잔존 · 무변경 update는 리비전 없음.

**`board-attachment.service.spec.ts` (5)**: 9종 저장+uuid 부여 · exe 거부(E5071) ·
11개 거부(E5072) · 링크는 http(s)만(E5073) · 서명 불량 다운로드 거부.

## 2. 마이그레이션 (로컬)

- 적용 → `boards` 백필(테넌트 수만큼) · 신규 4테이블 · **kb_board_posts 드랍** 확인.
- `migrations:manifest` 재생성(74파일) — CI 게이트 함정 선반영.
- init-sql(01-schema)도 동기화(신규 4테이블 추가·구 테이블 제거).

## 3. 통합 (로컬 실서버, `successfully started`)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | `GET /board` → lazy ensure로 기본 보드 반환 | ✅ |
| I2 | 문서 생성: 그룹·1/2차 분류·작성팀(consult)·태그 2종·`[[환불 예외]]` 링크 파싱, draft | ✅ |
| I3 | 수정+게시 → status published·links 재파싱, 리비전 (1 create)→(2 update[status,content]) | ✅ |
| I4 | webp 업로드 → 서명 URL 200 · **서명 변조 403** · GDrive 링크 첨부 | ✅ |
| I5 | exe 업로드 → E5071 | ✅ |
| I6 | category-counts(그룹→1차→2차)·태그 필터 목록·FULLTEXT 검색 경로 실행 | ✅ |
| I7 | master 삭제 → 문서·첨부 소멸, 리비전 3건(create/update/delete) 잔존 | ✅ |
| I8 | typecheck 9/9 · i18n 6개 언어 complete(board 네임스페이스 신규) · 전체 빌드 green | ✅ |

## 4. 스테이징 검증 계획 (RPT에 기록)

1. **SQL 선적용** → 전 테넌트 boards 1행 백필·kb_board_posts 소멸 확인 → 코드 배포.
2. 라우트 401 · 콘솔 `/knowledge/board` 육안(목록·에디터·첨부·히스토리) ·
   /knowledge 배너 진입.
3. go2joy에서 문서 1건 작성·게시 실확인.
