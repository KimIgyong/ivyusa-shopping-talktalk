-- migration_widget_login_mode.sql — widget sign-in mode (PLN-Widget-Login-Redirect-Orders)
-- Adds tenants.widget_login_mode: how the widget's "Sign in" opens the storefront
-- login — 'redirect' (whole-tab navigation, default) or 'popup' (window.open).
-- Console-editable at /settings; delivered to the widget via session/ensure.
-- Run BEFORE deploying the backend (old code + new column = safe).
-- Idempotence: guard with `SHOW COLUMNS FROM tenants LIKE 'widget_login_mode'` before running.

ALTER TABLE `tenants`
  ADD COLUMN `widget_login_mode` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'redirect' AFTER `consent_notice_version`;
