# RPT-260829 — 지식 페이지 3차: 파일 AI 인제스천 + YouTube 영상 지식화 P1

- 요구/계획/테스트: `REQ-260829-Knowledge-Page-Enhancements.md`(R4·R5) →
  `PLN-260829-KB-File-AI-Ingest.md`(승인) → `TCR-260829-KB-File-AI-Ingest.md`
- PR 4건 (전부 squash, 2026-08-29):
  **#439** 본 기능(main `28f0464`) · **#440** pdf-parse v2 API(`79e8c71`) ·
  **#441** YouTube innertube(`fbbf502`) · **#442** 업로드 파일명 latin1 디코드

## 1. 무엇이 만들어졌나

1. **비동기 AI 인제스트 파이프라인**: `POST /knowledge/ingest/{file|video}`(202) →
   `GET /knowledge/ingest/status` 폴링(추출→청크 분석 진행률) → 초안 검수 →
   `POST /knowledge/ingest/approve`. 테넌트당 1잡(E5069), **승인 전에는 아무것도
   지식이 되지 않음**(D4-1).
2. **추출**: pdf(pdf-parse v2)·docx(mammoth)·xlsx(exceljs)·csv, 15MB/200K자(절단 고지),
   실패 사유 E5066~E5068 분리. 원본은 `kb_files` 보관(테이블 첫 실사용, source_id=0 센티널).
3. **AI 분할**: 기존 함수+feature 선례(충돌 판정과 동일)로 `SUMMARY`+`knowledge_ingest`
   라우팅 — PLN P3-3의 신규 INGEST 함수 대신 검증된 패턴 채택(미세 조정). 청크당 JSON
   아티클 산출, 기존 그룹 카테고리를 프롬프트로 주입해 우선 매핑, **파싱 실패는 통짜
   폴백 초안**(P3-4 — stub 환경 E2E도 이 경로로 성립).
4. **YouTube P1**: innertube player(ANDROID 컨텍스트)로 공개 자막 추출(수동 우선),
   실패 전부 E5070. 승인 문서는 `source=youtube`, source_url=영상 URL.
5. **콘솔 [AI 임포트] 모달**: 그룹 선택(상담/상품추천/운영 라벨), 파일/영상 탭, 진행률,
   초안 검수(체크박스·제목/카테고리 수정·폴백 뱃지·본문 접기), 6개 언어 i18n.

## 2. 검증 결과

| 단계 | 결과 |
|---|---|
| 단위/회귀 | 신규 4스위트+실PDF 가드, **172 suites / 1,749 green** · typecheck · i18n complete |
| 로컬 stub E2E | 202→폴백 초안→승인(FILE-1-1 embedded)→kb_files 행→이중 승인 거부→E5070 |
| **스테이징 실 PDF**(ivyusa) | 실제 이중언어 PDF(5,343자) → 실 LLM **초안 6건**(작업 단위 분할·이중언어 제목·신규 카테고리 일관 제안, 폴백 0) → 1건 승인 `FILE-1-1` embedded(실 Voyage) → 검증 후 테스트 문서 삭제 |
| **스테이징 YouTube**(go2joy) | 자막 영상 → `Me at the zoo [en]` → 실 LLM 초안 1건, 기존 Reference 카테고리 매핑. 승인은 생략(go2joy 오염 방지 — 승인 경로는 PDF 건으로 증명) |
| 배포 | 매 픽스마다 재배포·`successfully started`·라우트 401 확인 |

## 3. 실전 검증이 잡은 결함 3건 (전부 당일 수정)

| # | 결함 | 원인·수정 |
|---|---|---|
| F1 (#440) | 실 PDF 전건 E5067 | 설치된 pdf-parse **2.4.5는 클래스 API**인데 v1 함수형 호출 — mock 단위 테스트는 통과. 수정 + **무목·자식 프로세스 실PDF 회귀 가드**(pdfjs 레거시가 jest 샌드박스와 충돌해 자식 node로 격리) |
| F2 (#441) | 자막 트랙은 파싱되나 timedtext 0바이트 | 유튜브 pot 토큰 요구(최근 변경). watch 스크레이핑 → **innertube ANDROID** 전환(HTML 파싱 자체 제거) |
| F3 (#442) | 한글 파일명 mojibake | 멀터 latin1 디코드 — `decodeUploadName`(U+FFFD 시 원본 유지)을 업로드 3라우트에 적용 |

## 4. 예방 패턴

- **파서류 의존성은 mock 테스트만으로 "동작"을 주장하지 말 것** — 설치 버전의 실제 API
  형태(v1 함수 vs v2 클래스)는 mock이 못 본다. 커밋된 실파일 픽스처 + 실행 환경(플레인
  node) 기준의 무목 가드를 스위트에 남겨라.
- **외부 비공식 API는 응답이 "성공적으로 비어" 올 수 있다** — 트랙 목록은 정상인데 본문만
  0바이트. 단계별 진단(페이지→트랙→본문)이 원인 격리를 5분으로 줄였다.
- **git 함정 재발**: fetch 없이 `checkout -b origin/main` → 직전 머지가 빠진 베이스
  (이번엔 push 전 발견·merge로 복구). 브랜치 생성 직전 fetch를 관성으로.

## 5. 운영 메모 / 잔여

- 비용: 파일당 최대 ~17 LLM 호출(200K자 상한) — 테넌트 AI 사용량 계측에
  feature=`knowledge_ingest`로 자동 계상.
- 스캔 PDF(OCR)·자막 없는 영상(STT P2)은 명확한 오류로 안내 — 로드맵 보류 항목 유지.
- innertube는 비공식 표면 — 깨지면 E5070으로 수렴하고 `youtube-transcript.util.ts` 한
  파일만 교체.
- REQ-260829 로드맵 **5종 전체 완결**(1차 #435 · 2차 #437 · 3차 #439~#442).
