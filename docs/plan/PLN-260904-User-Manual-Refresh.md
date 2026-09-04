# PLN-260904 — 사용자 매뉴얼 전면 갱신 구현 계획

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-09-04 |
| 근거 | REQ-260904-User-Manual-Refresh |
| UI 영향 | **없음** — 문서·정적 자산만 변경 (신규 화면·컴포넌트 없음, ASCII 와이어프레임 불요) |
| 스키마 영향 | 없음 (Migration 섹션 불요) |

## 단계

### Stage 0 — 대체된 드래프트 정리 (즉시)
- `user-manual-refresh` 워크트리(미커밋 141파일)와 `session/user-manual-refresh` 브랜치 제거.
  근거·내용 처분은 REQ §1.2에 기록 완료 — 살릴 것 없음 확인됨.

### Stage 1 — 한국어 원본 개정 (핵심)
- `docs/guide/사용자매뉴얼_User-Manual.ko.md` v2.1.0: REQ §1.3 갭 전부 반영.
  - §14 환경설정: 7탭 구조로 재서술(#367) + AI 엔진·사용량·대화 기본값·시나리오 라벨.
  - §13 지식·AI: 스마트 지식 보드(보드→채택→KB 폐루프)·AI 인제스트·일괄등록/다운로드·
    카테고리 그룹·에이전트 스코프·소스(노션 포함) 재서술.
  - §4 라이브챗: 핀·메시지 액션 4종·에이전트 필터.
  - §8~9 통계: 렌즈 4종·CSAT·고객여정 리포트.
  - §3 AI 흐름: deny-list answer-first 모드.
- `apps/web/public/manual/{quick-setup,knowledge-ai}.ko.md`: 경로·기능 갱신
  (quick-setup은 설정 7탭 경로 정정 중심, knowledge-ai는 보드·인제스트·일괄 도구 중심).
- 검증: 화면 라벨을 실제 코드(i18n ko 로케일)와 대조 — 8/24 방식 그대로.

### Stage 2 — 영어판 동기화
- `사용자매뉴얼_User-Manual.en.md` + `public/manual/{user-manual,quick-setup,knowledge-ai}.en.md`
  를 Stage 1과 동일 내용으로 개정. 검증: 잔여 한글 0.

### Stage 3 — HTML·베트남어판 재생성
- ko/en md 확정본 기준으로 `.html` 12종 + vi md/html 재생성(기존 아티팩트 디자인 유지).
- 검증: 태그 균형·교차 링크·언어 내비 전수 자체검사(8/24 체크리스트 재사용).

### Stage 4 — 스크린샷 선별 재캡처
- 구조가 바뀐 화면만: 설정 7탭·지식 문서 목록·지식 보드·라이브챗 메시지 액션·통계 렌즈·CSAT.
- 스테이징 실화면(ko·en), 기존 img/ 파일명 규칙 유지. 나머지 캡처는 존치.

### Stage 5 — 게시·검증
- PR(문서 전용) → squash 머지 → 스테이징 `deploy-staging.sh`(web 재빌드) →
  `https://shoptalk.amoeba.site/manual` 실열람 검증(내용 기준, 200 아님).
- TCR/RPT 작성.

## 측면 영향

- 코드 무변경 → 회귀 위험 없음. `public/manual`은 정적 서빙이라 web 빌드 외 영향 없음.
- platform-integration 3종은 #408에서 이미 8/26 기준 — Odoo/Woo/Haravan(#410~414)·Kotlin SDK(#428)
  추가분만 소폭 반영 (Stage 1에 포함).
- 스크린샷 파일 추가는 저장소 용량 증가(수 MB 예상) — 8/24의 60장 선례 범위 내.

## 승인 요청

Stage 0(드래프트 폐기)과 Stage 1~5 진행 승인을 요청합니다. 스크린샷 범위(Stage 4)를
줄이거나 뺄지도 함께 결정해 주세요.
