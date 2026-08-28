# TCR-260829 — 지식 페이지 1차(소스 삭제·board 정리·자격 UI·그룹 선택) 테스트

- 근거: `docs/plan/PLN-260829-Knowledge-Sources-DocGroup-UX.md`

## 1. 단위 테스트 (`knowledge.service.delete-source.spec.ts`, 4케이스 신규)

| # | 케이스 | 결과 |
|---|---|---|
| U1 | 활성 문서 2건 소스 삭제 → 배치 비활성화(1 UPDATE) + Qdrant setActive(false)×2 + 감사(`knowledge.source_deleted`, 수량 포함) + 행 삭제, 응답 `{deactivatedDocuments:2}` | ✅ |
| U2 | 문서 0건 소스 → UPDATE 생략, 감사·삭제는 수행 | ✅ |
| U3 | Qdrant 실패 → 삭제는 성공(warn만, reindex 회복 경로) | ✅ |
| U4 | 타 테넌트/미존재 소스 → 예외, 아무것도 안 건드림 | ✅ |

전체 회귀: **167 suites / 1,722 tests green** · typecheck 9/9 · i18n 6개 언어 complete.

## 2. 통합 (로컬 실서버, `successfully started` 확인)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | 소스(문서 2건 연결) DELETE → `{deleted:true, deactivatedDocuments:2}`, DB에서 두 문서 active=0·소스 행 소멸 | ✅ |
| I2 | `type:"board"` 소스 생성 → DTO 거부 `type must be one of: gdrive, notion` (기존엔 어댑터 단계 거부) | ✅ |

## 3. UI 검증 (구현 확인 항목 — 스테이징 배포 후 육안 확인 예정)

- 소스 행별 🗑 아이콘 → 확인 모달(소스명 + "문서는 비활성화" 고지) → danger 버튼.
  성공 토스트에 실제 비활성화 문서 수 표시(모달 사전 카운트는 미표시 — 소스 목록에
  문서 수 데이터가 없어 토스트 사후 보고로 대체, PLN 와이어프레임 대비 의도적 축소).
- 자격증명: 2칸 그리드 → 한 줄 접이식 행 2개. 미연결 시 [키 등록]으로 입력영역 토글,
  저장 성공 시 자동 접힘. 연결 시 식별자 인라인(툴팁=전체 문구).
- Add KB-Document 모달 그룹 Select(기본=활성 탭, 전체=counsel).

## 4. 배포 후 검증·운영 작업 계획 (RPT에 기록)

1. 라우트 검증(401)·콘솔 육안 확인(삭제 모달·접이식 자격 행·그룹 셀렉트).
2. **죽은 소스 6행 정리(P1-4)**: 테넌트 1(board 3, gdrive는 유지) · 테넌트 4(board 2,
   repository 1) — 신설 삭제 기능으로 제거, 비활성화 문서 수 기록.
