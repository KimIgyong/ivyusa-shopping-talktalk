# RPT-260808 — Shopify 주요 프로모션 툴 조사

Shopify 생태계에서 많이 사용되는 프로모션/마케팅 툴 카테고리별 조사 (2026-08-08, 웹 조사 기준).
목적: IVY USA(Shopify 테넌트) 캠페인 2트랙 방침(알림 + **Shopify 프로모션 링크**) 및
ShopTalk 위젯 연계 판단 근거.

## 0. 요약
- 프로모션 "생성"은 **Shopify 네이티브 할인 + 할인엔진 앱**이 표준, "배포"는 이메일/SMS(Klaviyo가 사실상 표준)·팝업·로열티 채널.
- 카테고리가 6개로 뚜렷이 나뉘며, 최근 추세는 **코드 입력 없는 자동할인(Shopify Functions 기반)**과 **번들/GWP(사은품) 통합형 앱**.
- ShopTalk과 겹치는 영역(리뷰·상품추천·웹푸시 알림)은 중복 도입 지양 — 위젯이 프로모션 **링크의 대화형 배포 채널** 역할을 하는 구도가 우리 방침과 정합.

## 1. Shopify 네이티브 (기본기 — 앱 도입 전 우선 검토)
| 기능 | 내용 |
|---|---|
| Discounts (기본 할인) | 코드/자동 할인, 금액·%·무료배송·BOGO(수량 조건) — 관리자 기본 제공 |
| Shopify Functions | 복잡한 할인 로직(조합·티어)을 서버사이드로 — 최신 할인 앱들의 기반 |
| Shopify Email | 무료 발송 쿼터 포함 기본 이메일 캠페인(소규모 시작점) |
| Shop 앱 캠페인 | Shop 채널 노출/딜 |

## 2. 할인/프로모션 엔진 (코드·자동할인·티어·BOGO)
| 앱 | 특징 |
|---|---|
| **AIOD (All-in-One Automatic Discount)** | 자동할인 중심 올인원 — 번들·BOGO·사은품·도매가·티어·볼륨을 한 대시보드에서 |
| **FAD – Automatic Discounts** | 자동+코드 병행, 볼륨/티어/BOGO/카트 조건/상품별 |
| **Bold Discounts** | 최장수·대규모 스토어와이드 세일에 강함(플래시세일·동적 가격) |
| **Kite Discounts** | 복잡한 BOGO/사은품(GWP) 특화, Shopify Functions 네이티브 |
| **Discount Ninja** | 프로모션 엔진형 — 동적 할인·개인화 프로모션 |
| Discounty / Dealeasy | 플래시세일·티어 / 볼륨·도매 특화 경량 앱 |

## 3. 이메일/SMS 마케팅 (프로모션 배포 채널의 중심)
| 앱 | 포지션 |
|---|---|
| **Klaviyo** | 사실상 표준. 딥 네이티브 연동·세그먼트·자동화 플로우·매출 귀속. 1만 컨택트 이상부터 가격 급증. 무료: 250컨택트/월 500통 |
| **Omnisend** | 이메일+SMS 통합 가성비(4.7~4.8★) |
| Shopify Email | 무료 시작점 |
| Postscript / TxtCart 등 | SMS 전문(미국 시장 중심) |
| Mailchimp / ActiveCampaign | 콘텐츠 중심 / 고급 자동화 |

## 4. 팝업/리스트 수집 & 온사이트 전환
- **Privy**(팝업·수집 대표 — Klaviyo/Omnisend와 페어링 일반적), **Wisepops**, Justuno
- 스핀휠(Wheelio류)·카운트다운·무료배송 바: 소형 앱 다수(설치 수 많으나 브랜드 톤 고려 필요)

## 5. 업셀/크로스셀/번들 (AOV 상승)
| 앱 | 특징 |
|---|---|
| **ReConvert (現 Upsell.com)** | 감사 페이지→포스트퍼체이스 원클릭 업셀(재결제 불필요), AOV +5~10% 보고 다수 |
| **Rebuy** | AI 추천(상품/카트/체크아웃) — 카트·브라우징 기반 업셀/번들 |
| Bundler / Fast Bundle / PickyStory | 믹스앤매치·수량 할인 번들 특화 |
| BOGOS | 사은품(Free Gift) 특화 |

## 6. 로열티/리퍼럴/제휴
| 앱 | 포지션 |
|---|---|
| **Smile.io** | 중소형(연매출 <$1.5M) 대표 — 포인트·VIP·리퍼럴 저비용 |
| **LoyaltyLion** | $1.5M+ 규모 — 세그먼트·분석 심도 |
| **Yotpo Loyalty** | 리뷰+SMS+이메일 통합 번들형 |
| Rivo / BON / Joy(4.9★ 1,691리뷰) / Growave | 저가·올인원 대안 |
| **UpPromote**(4.9★ 3,245리뷰) | 제휴(어필리에이트) 마케팅 대표 |

## 7. 리뷰/사회적 증거 (프로모션 전환 보조)
Judge.me(가성비 표준), Loox(포토 리뷰), Yotpo(엔터프라이즈 통합), Fera — ※ ShopTalk은 자체 리뷰 도메인 보유.

## 8. IVY USA / ShopTalk 시사점
1. **방침 정합**: 캠페인 2트랙(알림 + Shopify 프로모션 링크만) 유지가 생태계 구도와 맞음 —
   프로모션 생성은 Shopify 네이티브(+필요시 §2 자동할인 앱 1개), ShopTalk은 위젯 알림/캠페인 딥링크로 **배포**를 담당.
2. **Klaviyo 연동 여지**: IVY USA가 Klaviyo 사용사라면(커넥터 보유) 위젯 GA4/UTM 래퍼와 캠페인 트래킹 축이 이미 호환 —
   ShopTalk 캠페인 ↔ Klaviyo 세그먼트 연동은 후속 검토 후보.
3. **중복 도입 지양(적정기술)**: 리뷰·상품추천(RAG)·웹푸시는 ShopTalk 자체 기능과 겹침 — 외부 앱 추가보다 기존 기능 활용.
4. **자동할인 추세 참고**: 코드 입력 없는 자동할인(AIOD/Kite류)이 표준화 — 캠페인 딥링크가 "코드 복사" 없이
   할인 적용된 랜딩으로 이어지는 UX가 전환에 유리(링크에 할인 자동 적용 `discount/{code}` URL 패턴 활용 가능).

## 출처
- amasty.com/blog/best-shopify-discount-apps · seguno.com blog(2026 discount apps) · bogos.io · skailama.com
- omnisend.com/blog/best-email-marketing-for-shopify · emailtooltester.com · txtcart.ai(SMS)
- hellorep.ai(업셀) · fastbundle.co · wisepops.com/blog/best-shopify-apps
- voucherify.io(로열티 비교) · charleagency.com(로열티) · growave.io
- apps.shopify.com/categories/marketing-and-conversion-promotions · apps.shopify.com/reconvert
