# KB Reference — 미국 코스메틱 쇼핑몰 교환/취소/환불 CS 정책 요약

- 문서 ID: KB-US-Cosmetics-CS-Policy-Reference-20260707
- 용도: shoptalk RAG(Knowledge Store, `kb_documents`) 참고 문서 원본. 시드 등록본은 `apps/api/src/database/seed.runner.ts` 참조.
- 근거: Sephora 공식 정책(2025-04-24 발효), Ulta Beauty, Glossier, California Civil Code §1723, FTC Mail/Internet Order Rule. 출처는 문서 하단.

## 1. 업계 표준 요약 (리서치 결과)

### 반품(Return)
| 항목 | Sephora | Ulta | Glossier |
|---|---|---|---|
| 반품 기한 | 구매 후 30일 | 30일(원결제 환불) / 31–60일(적립금) | 수령 후 30일 |
| 개봉 제품 | "new or gently used" 허용 | gently used 허용 | 원칙적 미사용·미개봉 (불량은 예외) |
| 구매 증빙 | 필수 (영수증/주문 확인 메일/계정) | 필수 또는 시스템 조회 | 필수 |
| 반품 배송비 | 무료 (프리페이드 라벨) | 매장 무료, 우편은 조건부 | 무료 |
| 최초 배송비 | 판매자 과실 외 환불 불가 | 동일 | 동일 |

공통 특징: ①30일이 사실상 표준 기한 ②위생 우려에도 "gently used"(가볍게 사용) 개봉품 반품 허용이 대형 리테일 표준 ③반품 남용 모니터링·거절 권리 명시 ④기프트카드·final sale·일부 위생 민감 품목은 반품 불가.

### 교환(Exchange)
직접 교환보다 "반품 후 재주문"이 표준 흐름. 색상/옵션 교환은 반품 절차와 동일 기한·조건 적용. 파손·불량·오배송은 무상 교체.

### 주문 취소(Cancellation)
주문 후 수정(주소·품목 변경) 불가가 일반적. 취소는 주문 직후(~1시간) 또는 출고 준비 진입 전까지만 가능. 출고 이후에는 취소 대신 반품 절차 안내. 취소 시 전액 환불, 가승인(pre-authorization)은 1–7영업일 내 해제.

### 환불(Refund)
원결제 수단 환불이 원칙(카드→카드, PayPal→PayPal, 기프트카드→스토어 크레딧). 우편 반품은 접수~환불까지 최대 30일. 선물 반품은 수령인 앞 스토어 크레딧. 환불 시 적립 포인트 회수.

### 미국 규제 참고
- **California Civil Code §1723**: "7일 내 전액 환불/동등 교환"보다 엄격한 정책은 구매 전 눈에 띄게 고지해야 함(온라인은 명확한 정책 페이지 링크로 충족). 미고지 시 구매자는 7일 내 전액 환불 권리, 위반 시 30일 내 반품 시도에 대해 구매액 배상 책임. 식품·위생상 재판매 불가 상품·"final sale" 표기 상품 등은 예외.
- **FTC Mail/Internet Order Rule**: 약속한 기한(무약정 시 30일) 내 출고 불가 시 고객에게 지연 고지 + 취소·전액 환불 옵션 제공 의무.

## 2. IVY USA 정책 초안 → RAG 등록 문서 (7건, EN)

RAG 검색기는 content 앞 400자를 스니펫으로 사용하므로 주제별 단문 문서로 분리. 시드에 아래 제목으로 등록됨(카테고리: policy/faq).

1. **CS Policy — Returns (US Cosmetics Standard)** [policy] — 30일, gently used 허용, 증빙 필수, 원결제 환불
2. **CS Policy — Exchanges** [policy] — 반품 후 재주문 권장, 불량/오배송 무상 교체
3. **CS Policy — Order Cancellation** [faq] — 출고 준비 전/1시간 내 취소, 이후 반품 전환
4. **CS Policy — Refunds (Method & Timeline)** [policy] — 원결제 수단, 5–10영업일, 우편 최대 30일
5. **CS Policy — Final Sale & Non-returnable Items** [policy] — 기프트카드·final sale·위생 민감 품목 제외
6. **CS Policy — Damaged, Defective, or Wrong Items** [faq] — 수령 7일 내 사진 접수, 무상 교체/전액 환불
7. **CS Policy — US Compliance Notes** [policy] — CA §1723 고지 의무, FTC 출고 지연 규칙 (상담원 참고용)

## 3. 설계 관점 결정 필요 사항 (Open Issues)

- **POL-005 충돌**: 기존 시드 `Returns & Exchanges` 문서는 "미개봉 7일 반품"(POL-005). 본 초안은 업계 표준 "30일 + gently used". 두 문서가 RAG에 공존하면 AI 답변이 상충할 수 있음 → SPEC POL-005 개정 또는 기존 시드 문서 비활성(`active=0`) 중 택일 필요.
- 모더레이션 규칙에 'unverifiable refund promises' block 룰이 이미 존재(FR-069) — 환불 문서 문구는 확정적 약속형("we will refund")이 아닌 정책 조건형으로 유지함.
- 다국어: KB 원문은 EN 유지, 응답 언어는 `session.language` 기반으로 AI가 현지화(기존 설계 유지).

## Sources

- [Sephora Returns & Exchanges (official, 2025-08-28 갱신)](https://www.sephora.com/beauty/returns-exchanges)
- [Sephora Billing, Canceling & Modifying Orders](https://www.sephora.com/beauty/billing)
- [Ulta Beauty Guest Services](https://www.ulta.com/guestservices/all) · [Ulta return policy 요약(2026)](https://allreturnpolicies.com/ulta-return-policy/) · [SuperMoney Ulta guide](https://www.supermoney.com/what-is-ultas-return-policy)
- [Glossier return policy 요약](https://www.returnhow.com/glossier-returns/)
- [California AG — Refund Policies](https://oag.ca.gov/consumers/general/refunds) · [CA Civil Code §1723](https://law.justia.com/codes/california/code-civ/division-3/part-3/section-1723/)
