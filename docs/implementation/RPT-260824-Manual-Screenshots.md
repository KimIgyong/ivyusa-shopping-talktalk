# RPT-260824 — HTML 매뉴얼에 주요 메뉴 화면 스크린캡처 추가

| | |
|---|---|
| 문서 ID | RPT-260824-Manual-Screenshots |
| 작성일 | 2026-08-24 |
| 선행 | REQ/PLN-260824-Manual-Screenshots (PLN 승인: 2026-08-24, 결정 O1=ko+en 2세트, O2=로컬 위젯) · TCR-260824 동명 |
| 변경 성격 | 정적 자산+HTML — 코드·스키마 변경 없음 |

## 1. 무엇이 바뀌었나

`/manual`의 HTML 매뉴얼 9종(3문서 × ko/en/vi)에 실제 화면 캡처 **60개 figure**(이미지
30장 재사용)를 삽입. 캡처는 **로컬 dev + 데모 데이터**에서 ko·en 콘솔 2세트로 촬영
(스테이징 실화면은 MFA 강제·PII 노출 위험으로 배제 — REQ §3). vi 매뉴얼은 en 캡처 사용.

## 2. 파일

| 구분 | 내용 |
|---|---|
| `apps/web/public/manual/img/` | 캡처 30장 (`{name}.{ko,en}.jpg`, JPEG q80, 총 3.0MB) |
| html 9종 | figure CSS + figure 10/5/5 삽입 (quick-setup/knowledge-ai/user-manual × 3언어) |
| 문서 | REQ/PLN/TCR/RPT-260824-Manual-Screenshots |

캡처 화면: 어드민 테넌트 목록+생성 모달 · 임시 비밀번호 모달 · 테넌트 로그인 · 강제
비밀번호 변경 · 설정(스토어 연동/설치 가이드+Cafe24 OAuth/위젯 탭·테마/상담원 연결) ·
AI 설정(에이전트·스튜디오) · 지식(소스·QA)+QA 확대 · 라이브챗 3열 · 대시보드 · 위젯
(시나리오 메뉴/동의 배너/AI 답변+지식 참조).

## 3. 구현 메모

- 캡처 중 발견·수정한 로컬 dev 결함: **apps/widget에 `.env`가 없어 `session/ensure`가
  자기 origin(5174)으로 가서 404** → 위젯이 조용히 불능(동의 저장도 무요청 실패).
  `.env.example` 복사로 해결(gitignored — 커밋 대상 아님). 스테이징/프로덕션은 nginx
  동일 origin이라 무관.
- 위젯이 이전 세션 캐시(`ivy_session`)를 물고 있으면 동의 배너·버튼이 전부 무반응 —
  localStorage 정리 후 정상. (운영 트러블슈팅에 유용한 패턴)
- 로컬 한정 변경(복원 불필요): dev@/admin@ 로컬 비번 `IvyManual2026!a`로 변경(시드
  강제변경 처리), 데모 사용자 manual-demo(2)@example.com 2건 생성(invited).
- 지식 화면 캡처는 PR #341(분류 체계 테넌트화) 이전 기준 — 편차는 TCR §3 참조.

## 4. 테스트 결과

TCR §1 T1~T7 전부 통과(이미지 30·figure 60·깨진 참조 0·빌드 그린). T8~T10은 배포 후.

## 5. 배포 상태

- **PR #347** 머지(main `e4549a8`) → ✅ **스테이징 배포·검증 완료 2026-08-24**
  (서버 pull + `deploy-staging.sh`, 마이그레이션 없음).
- TCR §2 통과: 이미지 표본 8/8 → 200(`image/jpeg`), quick-setup.ko figure 10/
  user-manual.vi figure 5 서빙 확인, **브라우저 실측** — ko(그림·캡션·테두리 정위치
  렌더)·vi 페이지 렌더 정상, API health ok·SPA 회귀 없음.
