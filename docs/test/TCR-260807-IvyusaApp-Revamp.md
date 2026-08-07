# TCR-260807-IvyusaApp-Revamp — 고객앱 개편 F1-F4 테스트 보고

- 작성일: 2026-08-07
- 대상: PLN-260807-IvyusaApp-Revamp F1(카탈로그)~F4(캠페인 딥링크)
- 방식: 단계별 멀티에이전트 병렬 구현(11 에이전트) → 오케스트레이터 통합 검증 →
  단계별 PR(#135~#138) + CI 필수 체크 통과 + 스테이징 migration 선적용·배포·검증

## 1. 단위 테스트 누적 (Jest, apps/api)

| 단계 | 스위트/테스트 | 신규 |
|---|---|---|
| 시작점 (main 72d5f59) | 58 / 599 | — |
| F1 카탈로그 | 58 / 599 → +product 3스위트 38케이스 포함 | sync 매핑(2页 fixture·HTML strip·미완주 시 archive 스킵), 목록 검색/카테고리/테넌트 스코프, 상세 404, CSV 브리지 |
| F2 인게이지먼트 | 61 / 624 | saves upsert/CJM 1회 발행, nudge 코드 충돌 루프·views 원자 증가, 리뷰 소유권 403·모더레이션 422·hidden PATCH, privacy 그리드 |
| F3 다이어리·피드 | 63 / 644 | journey 401/페이지네이션, diary 소유권·1000자·핀 404, 추천(시그널 정렬·찜 제외·콜드스타트), order_created 신규행 가드 |
| F4 딥링크 | **64 / 655 ALL PASS** | 캠페인 send 검증(핸들·https·400), dispatch 링크 해석→notify 전달, notify link_url 영속+push payload, push data.url/handle |

전 단계에서 `npm run typecheck`(api/web/widget/mobile/pwa) 0 errors, PWA `vite build` 성공,
RN `tsc --noEmit` 0, `node --check sw.js` OK, 엔티티 변경 시 실부트(successfully started) 검증.

## 2. 로컬 실E2E (단계별)

| # | 시나리오 | 결과 |
|---|---|---|
| E1 | **ivyusa.com 실동기화**: 부팅 initial fill → products_cache **2,275행**(이미지·가격 100%) | PASS |
| E2 | GET /products 목록/검색('lip' 186건)/카테고리(90종)/상세/404 | PASS |
| E3 | 찜 등록 → GET /saves 카탈로그 조인 응답 | PASS |
| E4 | 조르기 생성 → 공개 카드 GET /nudges/:code **무토큰** 조회(상품+메시지) | PASS |
| E5 | 리뷰 가드: 미존재 아이템 404 (타인 아이템 403은 단위테스트) | PASS |
| E6 | 다이어리 작성(상품 핀)+목록+삭제 | PASS |
| E7 | 저니 타임라인에 실이벤트 기록: product_view/nudge_sent/wish_added | PASS |
| E8 | 추천: 찜 시그널 기반 5건, 찜 상품 제외 | PASS |
| E9 | **캠페인 풀루프**: 관리자 로그인 → 상품 링크 캠페인 → 잘못된 핸들 발송 **400** → 정상 발송 → 전 알림 행 `link_url`=상품 페이지 URL (UTF-8 저장 HEX 검증) | PASS |

## 3. 스테이징 검증 (배포 순서: migration 선적용 → 배포 → 확인)

| 단계 | migration | 배포 검증 |
|---|---|---|
| F1 (#135, main fabe7d2) | products_cache ✅ | 부팅 자동 초기 적재(ivyusa.com→921+행 진행 확인), /products 921건 응답, /app/products 200 |
| F2 (#136, main 3baf0c4) | product_saves+nudges ✅ | /saves 익명 401, /nudges/NOPE 404, /app/nudge/* 200, admin PATCH 401(=배포) |
| F3 (#137, main cc22144) | diary_notes ✅ | /me/journey 익명 401, 추천 3건(콜드스타트=신상품), /app/diary 200 |
| F4 (#138, main 5125871) | notifications.link_url ✅ | 컬럼 확인, campaigns 401(=배포), **sw.js 셸 캐시 v2 서빙 확인** |

모든 배포: `successfully started` + 컨테이너 신규 기동 + 신규 라우트 상태코드(401/404/200)
+ **content-type/본문 확인**(FIX-StagingNginxStaleMount 예방 패턴 준수).

## 4. 통합 중 발견·수정 결함
| # | 결함 | 수정 |
|---|---|---|
| I1 | diary remove: API DTO `id @IsInt`(파이프 implicit conversion 없음) vs PWA `note_id`(string)·RN string — 클라이언트 400 | 두 클라이언트 `id: Number()` 통일 (병렬 계약 불일치 — 오케스트레이터 검수에서 포착) |
| I2 | (부수 발견) 콘솔 캠페인 content가 whitelist 파이프에 잘려 **본문이 저장된 적 없음** | F4 콘솔 수정에 포함 (content JSON으로 정상 전송) |

## 5. 미검증 항목 (후속)
- 실기기/실브라우저: 홈 피드·상품 그리드·공유 시트·푸시 탭 상품 딥링크의 시각/UX 확인
  (typecheck·번들 검증만 완료 — 기존 RN/PWA 트랙과 동일한 수동 스모크 필요)
- 스테이징 캠페인 실발송: 콘솔 로그인 필요(스테이징 관리자 비밀번호 정책) — 콘솔에서
  상품 링크 캠페인 1건 발송 → 옵트인 고객 푸시 → 탭 → 상품 상세 확인 절차 권장
- 카탈로그 스케줄 동기화 6시간 주기 관찰(PRODUCT_SYNC_INTERVAL_MIN=360)
