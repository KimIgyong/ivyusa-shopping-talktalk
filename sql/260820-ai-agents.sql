-- PLN-260820-Multi-AI-Agent-Personas — 복수 AI 상담 에이전트
--
-- 페르소나가 tenant_ai_config에 테넌트당 1행으로 고정되어 있어 진입점별
-- (랜딩/어드민/파트너/광고) 에이전트를 나눌 수 없다. ai_agents 테이블을
-- 신설하고 기존 persona/rules를 각 테넌트의 기본(default) 에이전트로 백필한다.
-- tenant_ai_config의 나머지(시나리오·핸드오프)는 테넌트 공통으로 잔류.
--
-- 코드보다 먼저 적용할 것 (old code + new table = 무해).
-- 롤백:
--   ALTER TABLE agent_coaching_threads DROP COLUMN ai_agent_id;
--   ALTER TABLE tenant_ai_config_revisions DROP COLUMN ai_agent_id;
--   ALTER TABLE sessions DROP COLUMN ai_agent_id;
--   DROP TABLE ai_agents;
-- (tenant_ai_config.persona/rules는 건드리지 않으므로 롤백 시 구동작 복원)

-- 사람 상담원 테이블(agents)과 별개다 — conversations.agent_id는 사람.
CREATE TABLE IF NOT EXISTS `ai_agents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `persona` text COLLATE utf8mb4_unicode_ci,
  `rules` json DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aiagent_code` (`tenant_id`,`code`),
  KEY `idx_aiagent_tenant` (`tenant_id`,`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 백필: 테넌트마다 현행 persona/rules를 기본 에이전트 행으로. persona를 저장한
-- 적 없는 테넌트도 행은 만든다(콘솔 목록의 앵커이자 배정 폴백 대상).
-- 재실행 안전: 이미 default 코드가 있으면 unique로 스킵된다.
INSERT INTO ai_agents (tenant_id, code, name, persona, rules, active, is_default)
SELECT t.id, 'default', 'Default', c.persona, c.rules, 1, 1
FROM tenants t
LEFT JOIN tenant_ai_config c ON c.tenant_id = t.id
WHERE NOT EXISTS (SELECT 1 FROM ai_agents a WHERE a.tenant_id = t.id AND a.code = 'default');

-- 세션이 어느 에이전트에 배정됐는가 (진입점에서 1회 확정). NULL = 기본 에이전트.
ALTER TABLE sessions
  ADD COLUMN ai_agent_id bigint DEFAULT NULL
  COMMENT 'AI agent (ai_agents.id) answering this session; NULL = tenant default'
  AFTER tenant_id;

-- 페르소나 개정 이력이 어느 에이전트의 것인지. NULL = 기본 에이전트(과거 이력 포함).
ALTER TABLE tenant_ai_config_revisions
  ADD COLUMN ai_agent_id bigint DEFAULT NULL AFTER tenant_id;

-- 코칭 스레드가 어느 에이전트를 코칭 중인지. NULL = 기본 에이전트(기존 스레드 포함).
ALTER TABLE agent_coaching_threads
  ADD COLUMN ai_agent_id bigint DEFAULT NULL AFTER tenant_id;
