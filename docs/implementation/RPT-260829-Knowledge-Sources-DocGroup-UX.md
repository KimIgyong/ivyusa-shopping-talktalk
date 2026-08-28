# RPT-260829 — 지식 페이지 1차: 소스 안전 삭제·board 폐기·자격 UI 한줄화·문서 그룹 선택

- 요구/계획/테스트: `REQ-260829-Knowledge-Page-Enhancements.md`(R1+R3) →
  `PLN-260829-Knowledge-Sources-DocGroup-UX.md`(승인) → `TCR-260829-…`
- **PR #435** (squash) — main `39ffc40`, 2026-08-29

## 1. 무엇이 바뀌었나

1. **소스 안전 삭제**: `deleteSource`가 문서 일괄 비활성화(배치 UPDATE + Qdrant setActive)
   → 감사 `knowledge.source_deleted`(수량 포함) → 행 삭제. 응답 `deactivatedDocuments`.
   콘솔 소스 행별 🗑 + 2단계 확인 모달("문서는 비활성화" 고지) + 수량 토스트.
2. **board/repository 폐기**: `KNOWLEDGE_SOURCE_TYPES = ['gdrive','notion']` — DTO 단계 거부.
   레거시 행 표시·삭제 유지. (`kb_board_posts`/`kb_files` 테이블 드랍은 R4 결정 후 별도.)
3. **자격 UI**: 드라이브/노션 2칸 카드 → 접이식 한 줄 행 2개(등록 시에만 입력 확장,
   저장 성공 시 자동 접힘, 연결 시 식별자 인라인+툴팁).
4. **Add KB-Document 그룹 Select**(기본=활성 탭) — 암묵 그룹 결정 제거.

## 2. 파일

- API: `knowledge.service.ts`(deleteSource), `knowledge.controller.ts`,
  `knowledge.request.ts`(enum), `knowledge.service.delete-source.spec.ts`(신규 4케이스)
- Web: `KnowledgePage.tsx`(삭제 컬럼·확인 모달·그룹 Select·자격 스택),
  `SourceCredentialCard.tsx`(접이식 개조), `knowledge.{service,hooks}.ts`(deleteSource 클라이언트),
  i18n 6개 로케일(신규 키 5종)

## 3. 테스트·배포 상태

| 항목 | 상태 |
|---|---|
| 단위/회귀 | 신규 4케이스 · **167 suites / 1,722 green** · typecheck 9/9 · i18n complete |
| 로컬 스모크 | 문서 2건 소스 삭제→`deactivatedDocuments:2`·DB active=0, board 생성 DTO 거부 |
| 마이그레이션 | 없음 |
| 스테이징 배포 | 2026-08-29 `deploy-staging.sh` — api healthy·`successfully started`·health ok |
| UI 육안 확인 | 소스 🗑 컬럼·접이식 자격 행 2개·Add 모달 그룹 Select — go2joy 콘솔에서 확인 |

## 4. 운영 작업 (P1-4 죽은 소스 정리 — 완료)

| 테넌트 | 삭제한 소스 | 비활성화 문서 |
|---|---|---|
| go2joy(4) | board 4·8, repository 5 | 0 |
| ivyusa(1) | board 1(IVY Help Center)·3·6 | 10 (board 1에 시드 시절 파일링된 기초 정책 문서) |

- **ivyusa board 1의 문서 12건은 실지식**이라 삭제 직후 재활성화. 이 과정에서 원래
  의도적으로 숨겨져 있던 2건(문서 1 Shipping & Delivery, 4 Order Cancellation —
  8/4 충돌 검토에서 kept_b로 대체됨)까지 잠깐 활성화됐다가 리비전·충돌 이력으로 식별해
  재비활성 — **최종 상태는 삭제 전과 동일(활성 10·숨김 2)**, 소스 행만 제거됨.
- 잔여 소스: ivyusa gdrive 1건(policy), go2joy notion 1건 — 전부 실사용.

## 5. 예방 패턴

- **"죽은 소스"에도 산 문서가 붙어 있을 수 있다**: board 소스는 동기화 이력 0이었지만
  시드가 문서 12건을 그 소스에 파일링해 둔 상태였다. 소스 삭제 전 문서 수를 확인하고,
  일괄 재활성화가 필요하면 **이전에 의도적으로 숨긴 문서(충돌 해소 kept_a/b, superseded)**
  를 이력으로 가려내 제외할 것 — active 플래그만 봐서는 "삭제로 꺼진 것"과 "검토로 끈 것"이
  구분되지 않는다.

## 6. 잔여 (2차·3차)

- R2 카테고리 그룹화(스키마), R4 파일 AI 인제스천, R5 영상 P1 — REQ-260829 승인 로드맵대로
  후속 PLN 예정.
