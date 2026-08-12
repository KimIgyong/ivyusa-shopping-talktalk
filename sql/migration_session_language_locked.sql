-- PLN-260813-Session-Language-Mismatch P3 (D3) — 고객이 직접 고른 언어 보호
--
-- 자동 감지가 세션 언어를 갱신할 때, 그 언어를 고객이 언어 선택기로 직접
-- 고른 것인지 서버가 알 방법이 지금 없다. 위젯은 localStorage로 자기 UI를
-- 지키지만 시스템 문구는 서버가 결정하므로 서버에도 같은 사실이 필요하다.
--
-- additive · DEFAULT 0 → 기존 세션은 전부 자동 감지 대상(수동 선택 이력이
-- 없다는 뜻이므로 맞다). 코드보다 먼저 적용할 것.
-- 롤백: ALTER TABLE sessions DROP COLUMN language_locked;

ALTER TABLE sessions
  ADD COLUMN language_locked TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = shopper picked the language themselves; auto-detection must not override'
  AFTER language;
