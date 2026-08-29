# RPT-260829 — Smart Knowledge Board B1: 보드 코어

- 요구/계획/테스트: `REQ-260829-Smart-Knowledge-Board.md`(권고안 확정) →
  `PLN-260829-Smart-Knowledge-Board-B1.md`(승인) → `TCR-260829-Smart-Knowledge-Board-B1.md`
- **PR #444** (squash) — main `48758e1`, 2026-08-29

## 1. 무엇이 만들어졌나

1. **신규 도메인 `domain/board`** — 테이블 4종(boards/documents/revisions/attachments).
   테넌트당 기본 보드 1개: 마이그레이션 백필 + **lazy ensure**(첫 API 접근 시 생성,
   유니크 레이스 패자 회복 포함).
2. **문서**: 그룹(KB와 동일 값 축)·1/2차 분류·작성팀(job_labels)·MD 본문·태그·
   `[[위키링크]]` 저장 시 파싱(B3 백링크 재료)·draft/published(promoted/rejected는
   B2 예약, 편집기에서 거부). **전문 리비전 히스토리**(max+1 번호, 삭제 스냅샷 잔존, 복원).
3. **첨부**: 파일+외부 링크(GDrive) 단일 테이블, 50MB×9종·멀티 10개, zip/rar 보관 전용,
   uuid+공용 서명 URL(변조 403 확인). 이미지 [본문에 삽입].
4. **콘솔** `/knowledge/board`: 그룹 탭·2계층 분류 내비·태그 필터·FULLTEXT 검색 목록,
   `@uiw/react-md-editor` 편집(툴바+분할 프리뷰)·첨부 패널·히스토리 모달. /knowledge
   진입 배너. `board` 네임스페이스 6개 언어.
5. **청산**: 작성 화면이 없던 구 `kb_board_posts` 테이블·엔티티 드랍(REQ C1),
   init-sql 동기화. 에러코드 E5071~E5073.

## 2. 검증·배포 상태

| 항목 | 상태 |
|---|---|
| 단위/회귀 | 신규 12케이스 · **175 suites / 1,764 green** · typecheck · i18n · 전체 빌드 |
| 로컬 스모크 | lazy ensure → 작성(링크 파싱·draft) → 게시(리비전 2) → webp 서명 다운로드 200/변조 403 → GDrive 링크 → exe E5071 → 분류 카운트/태그 필터 → master 삭제(리비전 create/update/delete 잔존) |
| 마이그레이션 | 로컬·**스테이징 선적용→배포 순서 준수**. 스테이징 백필: **테넌트 13 = 보드 13**, kb_board_posts 소멸. manifest 재생성 |
| 스테이징 검증 | board 라우트 401 · go2joy에서 문서 1건 실작성·게시(위키링크 파싱 확인) · 콘솔 육안: 목록(탭·내비·태그 칩·상태 뱃지)·편집(메타 4필드·MD 분할 프리뷰·히스토리) 정상 |

## 3. 운영 메모 / 잔여 (로드맵)

- **B2(다음)**: KB 채택(promote, BRD-키·카테고리 매핑·재채택) + 시뮬레이션(후보 포함
  ask + confidence/유사도 + 골든셋 통과율), 인제스트 승인 타깃 Board 전환, KB '채택/직접
  등록' 뱃지.
- B3: 코멘트·@멘션·백링크 패널·Add KB-Document 동선 개편. B4: FAQ/Q&A 임포트 통합.
- go2joy 스모크 문서(id 1)는 B2 채택 플로우 검증 소재로 유지.
- 첨부 스토리지는 UPLOAD_DIR 볼륨 — 용량 모니터링은 기존 첨부와 동일 정책.
