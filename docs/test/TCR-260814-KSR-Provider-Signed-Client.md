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

## 3. 스테이징 (배포 후 기록)
| # | 케이스 | 확인 방법 | 결과 |
|---|---|---|---|
| S1 | 배포 후 부트·기존 채널1(레거시) 폴링 무회귀 | 부트 로그 + 채널 상태 | (배포 후) |
| S2 | 스테이징 relay(8091)에서 shoptalk 키 발급 + delivery enable → 채널에 key_id/secret 입력 → 연결 테스트 | 콘솔 | (키 발급 후) |
| S3 | 서명 모드 pull 실수신 + 커서 전진 | 로그·DB | (키 발급 후) |
| S4 | 회신(레거시 경로) 정상 — 하이브리드 확인 | 콘솔 회신 | (키 발급 후) |

## 4. 메모
- 서명 모드 커서는 채널 단위 `ksr:pcursor:{channelId}`(30일 TTL) — 유실 시 재수집은 ingest (thread, externalMessageId) 중복제거로 무해.
- origin 값이 개방형(`line_android_notification` 등)이라 서브채널은 부분일치 매핑 — 미지의 origin은 'relay'로 노출(조용한 배지 오분류 방지).
- provider 응답은 camelCase(운영자 API snake_case와 다름) — 어댑터에 별도 타입.
