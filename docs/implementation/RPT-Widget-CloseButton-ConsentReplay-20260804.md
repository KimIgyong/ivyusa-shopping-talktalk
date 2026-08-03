# RPT — 위젯 런처 X 숨김 + 동의 auto-replay (2026-08-04)

> PLN `docs/plan/PLN-Widget-CloseButton-ConsentReplay-20260804.md` ·
> TCR `docs/test/TCR-Widget-CloseButton-ConsentReplay-20260804.md`

## 1. 무엇이 바뀌었나

1. **런처 X 숨김**: 위젯 패널이 열려 있는 동안 하단우측 플로팅 런처 버튼을 렌더하지 않음.
   닫기는 패널 상단우측 X와 Esc로 일원화(요청 사항).
2. **동의 auto-replay**: 로컬 캐시(`ivy_consent`)를 `{state, version, at}` JSON으로 확장.
   새(pending) 세션에서 로컬 선택의 notice 버전이 현재 유효 버전과 일치하면 배너를 띄우지
   않고 `POST /session/consent`로 서버 세션에 자동 재기록. 실패 시 pending 복원(배너 표시).
   버전 bump 시 재동의 재노출(PRV-M4)·서버 세션별 기록 체계는 현행 유지.
   → Privacy notice가 Accept 1회 후 페이지 이동마다 재노출되던 문제 해결(익명 방문자 포함).

## 2. 변경 파일

`apps/widget/src/components/widget/Widget.tsx` (런처 조건 렌더),
`src/lib/consent.ts` (버전 레코드 + 레거시 파싱), `src/hooks/useSession.ts`
(pending 시 캐시 보존 + auto-replay), `src/components/chat/ChatTab.tsx` ·
`src/components/settings/PreferencesPanel.tsx` (버전 포함 저장),
docs (PLN/TCR/RPT). **API/스키마 변경 없음.**

## 3. 테스트 결과

- `npm run typecheck` / `npm run build` 전체 통과.
- 스테이징 실측(C1~C8)은 배포 후 §5에 추기.

## 4. 배포 상태

| 항목 | 값 |
|---|---|
| PR | #(작성 예정) `feature/widget-close-consent-replay` → main, squash |
| 마이그레이션 | 해당 없음 |
| 스테이징 배포 | 예정 (widget 재빌드) |

## 5. 스테이징 검증 기록

(배포 후 추기)
