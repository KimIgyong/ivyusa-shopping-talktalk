# TCR-260829 — Smart Knowledge Board B3(협업) 테스트

- 근거: `docs/plan/PLN-260829-Smart-Knowledge-Board-B3.md`

## 1. 단위 테스트 (전체 177 suites / 1,776 green)

**신규 `board-comment.service.spec.ts` (5)**: 멘션 정제(타 테넌트 id 조용히 제거·중복
제거·이름/이메일 폴백·미해석 작성자 `#id`) · 빈 본문 거부 · 삭제=작성자/디렉터 규칙 ·
mentionsFor=본인 태그 코멘트만 · removeAllFor=문서 코멘트 전멸.

## 2. 통합 (로컬 실서버, `successfully started`)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | 코멘트 등록: 멘션 [실유저, 9999] → 9999 정제, authorName 해석 | ✅ |
| I2 | **멘션함**: 최초 0건 → 원인이 **JWT userId 문자열**(JSON_CONTAINS가 `"1"` 검색·작성자 삭제 비교도 동일 위험) — 컨트롤러 경계 `Number()` 정규화로 수정(기록된 함정의 재발, 보드/리뷰 컨트롤러 동시 적용) → 1건 정상 | ✅ |
| I3 | **백링크 그래프**: 문서2가 [[환불 예외]] 링크(미작성 documentId:null) → '환불 예외' 문서 생성 → 문서2 backlinks에 등장 + outgoing 매핑, 상호 링크 | ✅ |
| I4 | 문서 삭제 시 코멘트 동반 삭제(removeAllFor 훅) — 단위로 검증 | ✅ |
| I5 | 마이그레이션: board_comments 생성·멱등·manifest 재생성·init-sql 동기화 | ✅ |
| I6 | typecheck 9/9 · i18n 6개 언어 complete · 전체 빌드 | ✅ |

## 3. UI 구현 확인 (스테이징 육안은 RPT에)

- 편집 하단 2패널: 코멘트(@ 자동완성 드롭다운·멘션 칩·삭제) + 링크(Backlinks/Outgoing·
  미작성 뱃지→제목 프리필 새 문서·제목 변경 안내).
- 보드 목록 "@나 N" 뱃지+멘션함 패널(문서 이동).
- KnowledgePage: [보드에 작성] primary(그룹 프리셋), 직접 추가 ghost 격하+안내 1줄.
- `/knowledge/board/new?group=&title=` 프리필.

## 4. 스테이징 검증 계획 (RPT에 기록)

1. **SQL 선적용**(board_comments) → 배포 → 라우트 401.
2. go2joy: 코멘트+멘션(스모크 계정 자기 멘션) → 멘션함 확인, 문서1의 [[빠른 객실 잠금
   설정]] 아웃고잉이 기존 운영 문서와 매칭되는지 확인.
3. 콘솔 육안: 2패널·멘션함·[보드에 작성] 동선.
