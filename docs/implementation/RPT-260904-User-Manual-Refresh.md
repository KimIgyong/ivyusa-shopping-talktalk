# RPT-260904 — 사용자 매뉴얼 전면 현행화 (v2.1) 구현 보고

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-09-04 |
| 근거 | REQ/PLN-260904-User-Manual-Refresh (PLN 승인 2026-09-04, Stage 4 포함 전체 승인) |
| PR / 커밋 | **#471** → main `b801a5e` (squash) |
| 성격 | 문서+정적 자산 — 코드·스키마 무변경, 마이그레이션 없음 |

## 1. 무엇이 바뀌었나

매뉴얼 4종 중 3종(통합 v2.0.0→**v2.1.0**, quick-setup·knowledge-ai v1.0→**v1.1**)을
2026-09-04 코드 기준으로 현행화. 8/24 동결 이후 머지된 사용자 대면 기능 PR 약 30건
(REQ §1.3 전수 목록)을 반영:

- **설정 재편**: `/settings` 7탭(테넌트 설정) 구조로 전면 재서술 — 상담원 연결
  카드 이동, AI 엔진(테넌트 자체 등록)·AI 사용량 카드, 저장≠연결 테스트 게이트,
  Odoo/Woo/Haravan 동기화 버튼, 연동 가이드 버튼
- **지식**: Smart Knowledge Board 표준 경로(작성→게시→시뮬레이션→KB 채택) 신설 장,
  일괄 다운로드↔등록 라운드트립+범용 상담가이드, AI 임포트(→보드), 카테고리
  에이전트 범위, 문서 목록 개편, 소스 안전삭제·전환 내역·Notion 실패 사유
- **AI 설정**: 기본 대화내용(내장 스크립트 7종), 언어별 시나리오 라벨·버튼별
  에이전트, 적용 설정 카드, 에이전트 표시명·첫 응답 메시지
- **라이브챗**: 핀(팀 공유 3개)·고객 메시지 액션 4종·에이전트 필터·세션 그룹핑·
  고객여정분석(신설 §4.5), 릴레이 채널 표기
- **통계·대시보드**: 6개 섹션 구조, "해결" 정의 통일·미리보기 제외 서술
- **핸드오프**: deny-list 「답변 안 함/답변 후 인계」 모드
- **어드민**: 요금제/애드온 모달(custom 플랜, 이슈 워크플로우 base/bridge/native)

## 2. 파일

| 구분 | 내용 |
|---|---|
| ko 원본 3종 | `docs/guide/사용자매뉴얼_User-Manual.ko.md` · `GUIDE-260824-{Quick-Setup,Knowledge-AI}-Manual.md` |
| en 원본 | `docs/guide/사용자매뉴얼_User-Manual.en.md` — **OUTDATED v1.1.0 방치본이었음** → v2.1로 재생성 |
| public md 9종 | `apps/web/public/manual/{user-manual,quick-setup,knowledge-ai}.{ko,en,vi}.md` |
| public html 9종 | 동일 3문서 × ko/en/vi — 기존 디자인·마크업 관례 유지 |
| 스크린샷 | `img/` 30→34장: 구화면 10쌍 재캡처(admin-tenants·ai-setting·dashboard·handoff-settings·knowledge·knowledge-qa·live-chat·settings-install·settings-stores·settings-widget) + 신규 2쌍(statistics·knowledge-board) figure 6개 배선 |
| 문서 | REQ/PLN(사전 PR 커밋 6c312bd) · TCR · 본 RPT |

## 3. 방법·검증

- 화면 사실은 **코드 기준**: Explore 3방향(설정·지식·AI/라이브챗/통계) 조사로 실제
  라우트·i18n 라벨을 수집해 집필. en/vi도 로케일 파일의 실제 문자열 사용.
- 스크린샷은 8/24 선례(REQ-260824-Manual-Screenshots §3)대로 **로컬 dev+데모
  데이터**에서 Playwright로 캡처(스테이징은 MFA·PII로 배제, PLN의 스테이징 캡처
  계획을 선례 쪽으로 정정). 뷰포트 1566×785·JPEG q80, 기존 파일명 규칙 유지.
- 검증 상세는 TCR-260904 — 한글 잔존 0(en/vi), 태그 균형 9/9, 이미지 참조 깨짐 0,
  public 링크 규약 준수.

## 4. 배포 상태

| 환경 | 상태 |
|---|---|
| main | ✅ `b801a5e` (PR #471, CI typecheck·test·build 통과) |
| 스테이징 | ✅ 2026-09-04 배포 — 서버 main pull + `deploy-staging.sh`(web 재빌드), 마이그레이션 없음. `/manual` ko/en/vi 실열람·신규 이미지 200 확인 (TCR §2) |
| 프로덕션 | — (미구축) |

## 5. 남긴 것 (후속 제안)

1. `/knowledge` 보드 배너 문구가 낡음("채택하는 기능은 곧 제공됩니다" — B2에서 이미
   출시). **코드 1줄 수정**이 필요해 문서 전용인 본 건에서 제외. 별도 FIX 권장.
2. `docs/guide/사용자매뉴얼_User-Manual.html` — v1세대 이중언어 유물(md 미러 아님).
   퇴역 또는 재생성 여부 결정 필요.
3. platform-integration 3종의 기존 quirk(내부 GUIDE 링크, '도식' 잔존) — 자격증명
   가이드 개정 시 함께 정리.
4. 위젯설정가이드·AI-SETTINGS-GUIDE 등 부속 가이드는 이번 범위 밖 — 다음 현행화
   대상.
