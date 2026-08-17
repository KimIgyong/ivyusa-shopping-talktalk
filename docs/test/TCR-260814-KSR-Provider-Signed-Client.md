# TCR-260814-KSR-Provider-Signed-Client

PLN-260814-KSR-Provider-Signed-Client 테스트 케이스·결과. 스키마 변경 없음.

## 1. 단위 (jest — 전체 1,136/1,136 PASS; 신규 서명 5 + 어댑터 서명모드 9)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | 스펙 예시 canonical 재현(빈 바디 sha256 포함) — `GET\n/api/provider/v1/instance\n1786455153\nabc-123\ne3b0c442…` | ✅ |
| U2 | 서명 형식 `v1=` + 64자 소문자 hex, canonical의 HMAC과 일치 | ✅ |
| U3 | **함정1 고정**: 접두사·쿼리 순서 다르면 서명 상이(재정렬·프리픽스 제거 = 다른 서명) | ✅ |
| U4 | 헤더 4종 매회 신규 발급 — 논스 중복 없음 + 재계산 검증 | ✅ |
| U5 | pull: `/messages?since_id=` 서명 호출, 대화당 메타 1회, outbound 제외, 커서 전진 | ✅ |
| U6 | 모든 요청 재서명(논스 전부 상이) — 재시도 409 함정 방지 | ✅ |
| U7 | customerRef 불일치 행 → pull 중단(오수신 차단) | ✅ |
| U8 | confirm: `/commands/:id` 단건, SENT_UNCONFIRMED 매핑, 404=failed | ✅ |
| U9 | test: instance+Expected-Customer 검증, 회신 경로 프로브, E1103→credentials, E5101→명시 문구 | ✅ |
| U10 | **레거시 무회귀**: 키 미설정 채널은 provider 경로 미사용(기존 14케이스 전부 유지) | ✅ |

## 2. 로컬 통합 (2026-08-14, 실 relay 서버 127.0.0.1:8099 — 빌드된 어댑터로 실호출)
| # | 케이스 | 결과 |
|---|---|---|
| L1 | test(): provider 연결 + customerRef(CUST-LOCAL-1) 검증 + "회신 비활성" 안내 | ✅ |
| L2 | pull(): 실데이터 7건 정규화 수신(subChannel=line/sms 매핑), 커서 38 저장 | ✅ |
| L3 | 2차 pull(): 증분 0건(커서 동작) | ✅ |
| L4 | confirm(존재하지 않는 command): 'failed' | ✅ |
| L5 | expected_customer 오설정: E5101 명시 실패 문구 | ✅ |
| L6 | (사전 검증) 서명 규격 컨포먼스 T1~T9 — 함정 2종 포함 전 케이스 통과 | ✅ 8/14 |

참고: consumer 'shoptalk' 키 발급 + **provider delivery enable**(E5109 게이트) 절차 확인 —
relay 콘솔에서 `PATCH consumers/shoptalk {enabled:true}` 필요(스테이징 운영 절차에 포함).

## 3. 스테이징 (2026-08-15 실행 — 전 케이스 통과)
| # | 케이스 | 확인 방법 | 결과 |
|---|---|---|---|
| S1 | 배포 후 부트·기존 채널1(레거시) 폴링 무회귀 | 부트 로그 + 채널 상태 | ✅ 8/14 (RPT #286) |
| S2 | shoptalk 키 발급 + delivery enable → 채널1에 key_id/secret/expected_customer 주입 → 서명 인증 검증 | 서명 프로브 3종 | ✅ 8/15 |
| S3 | 서명 모드 pull 실수신 + 커서 전진 | 로그·DB·Redis | ✅ 8/15 |
| S4 | 회신(레거시 경로) 정상 — 하이브리드 확인 | outbox·message_map | ✅ 8/15 |

**S2 상세** — 키는 relay 스테이징 DB(AES-GCM 저장)에서 relay 컨테이너 자체 `KSR_CRYPTO_SECRET`으로
복호화해 회수(발급분: `ksrk_17321e3d…`, consumer shoptalk, delivery enabled 8/13). 채널1 주입은
secret 블롭 재암호화(`password`+`api_secret` JSON 맵) + `config.key_id`/`expected_customer`
(`STG-AMOEBA-SELF-01`) SQL 갱신 — 사전 백업 `backup-messenger_channels-20260814-225838.sql`.
프로브 결과: ① instance+Expected-Customer → **200** (customerRef 일치) ② 오바인딩 → **409 E5101**
③ 서명 변조 → **401 E1103**. relay 키 `last_used_at` 갱신으로 ShopTalk 발신 서명 수용 교차 확인.

**S3 상세** — 주입 직후 틱부터 confirm이 서명 경로(`/api/provider/v1/commands/:id`)로 전환됨을
로그로 확인, `ksr:pcursor:1` 커서 (없음)→**4050** 전진 후 틱마다 안정, `last_error` NULL 유지.
첫 서명 pull의 백로그 재수집은 (thread, externalMessageId) 중복제거로 전량 무해 — 신규 중복
인바운드 **0건**. relay 측이 예고한 dedup_key 스코프 변경(tenant→agent) 재전달도 관측 0건.

**S4 상세** — E2E 중 신규 outbound 2건이 레거시 운영자 경로로 정상 발신(외부 id 163·164 매핑,
04:39/04:43), 이후 unconfirmed로 confirm 폴링 대상에 진입 — 하이브리드(D1a) 동작 그대로.

**환경 이슈(비-ShopTalk)** — E2E 개시 직후 relay 스테이징이 크래시 루프(미완성
`ReplyDispatchService` WIP가 rsync 배포에 섞임 → NestJS DI 부팅 실패, `/api/provider/*` 502).
relay 측 세션에 통지, 04:39Z 복구 후 재검증 완료. 이 사이 ShopTalk은 502를 명시 로깅하며
재시도(설계 의도대로). ⚠️ relay 스테이징의 현재 코드는 **origin 미푸시 상태**(owner 승인 대기)
— relay 서버를 git 기준으로 재동기화하면 이번에 검증된 빌드가 되돌아가므로 푸시 완료 전 금지.

**발견 F1 (경미·레거시 기인)** — relay가 `/commands/:id`에서 `EXPIRED`(failReason
handle_expired)를 반환하는 커맨드가 다수인데, `mapCommandStatus()`가
SENT/SENT_UNCONFIRMED/FAILED만 알고 나머지는 `'pending'`으로 떨어져 **unconfirmed 126건이 영구
재폴링**됨. 서명 모드가 아니라 레거시 매핑 시절부터의 갭이 E2E에서 표면화된 것. relay 측 확인
결과 EXPIRED는 **종결·확정 미발송**(전이 가드로 재변경 불가, outbound 미러링 없음; 참고로
OpenAPI의 SENT_CONFIRMED는 DB enum에 없어 실발생 불가) → `EXPIRED→'failed'` 매핑 수정
**PR #291** + `FIX-260815-KSR-Expired-Command-Mapping.md`. 8/15 스테이징 배포(`c533096`) 직후
첫 스윕들에서 백로그 소진 개시 확인(unconfirmed 127→93, 전부 failed로 확정) — 스윕당 BATCH
단위로 자연 소진.

## 4. 메모
- 서명 모드 커서는 채널 단위 `ksr:pcursor:{channelId}`(30일 TTL) — 유실 시 재수집은 ingest (thread, externalMessageId) 중복제거로 무해.
- origin 값이 개방형(`line_android_notification` 등)이라 서브채널은 부분일치 매핑 — 미지의 origin은 'relay'로 노출(조용한 배지 오분류 방지).
- provider 응답은 camelCase(운영자 API snake_case와 다름) — 어댑터에 별도 타입.
