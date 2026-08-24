/**
 * Shared temp-password email copy (PLN-260824) — used by both the self-service
 * recovery flow (auth) and the admin "send by email" option (user domain), so
 * the recipient sees identical wording regardless of who triggered it.
 *
 * Fixed en+ko wording (console emails are not session-localized). `baseUrl`
 * must come from server config only — never from request headers (phishing
 * vector); when unconfigured the mail shows the relative login path.
 */
export function buildTempPasswordMail(
  baseUrl: string | undefined,
  /** Absolute path of the login page: `/user/{slug}` for tenants, `/admin/login` for platform admins. */
  loginPath: string,
  email: string,
  tempPassword: string,
): { to: string; subject: string; text: string } {
  const base = (baseUrl ?? '').replace(/\/+$/, '');
  const loginLine = `${base}${loginPath}`;
  return {
    to: email,
    subject: '[ShopTalk] Temporary password / 임시비밀번호 안내',
    text: [
      `A temporary password was issued for your ShopTalk account (${email}).`,
      '',
      `Temporary password: ${tempPassword}`,
      `Sign in: ${loginLine}`,
      'You will be asked to set a new password when you sign in.',
      'If you did not request this, contact your workspace administrator.',
      '',
      '---',
      `ShopTalk 계정(${email})에 임시비밀번호가 발급되었습니다.`,
      `임시비밀번호: ${tempPassword}`,
      `로그인: ${loginLine}`,
      '로그인하면 새 비밀번호 설정을 요청받습니다.',
      '본인이 요청하지 않았다면 워크스페이스 관리자에게 문의하세요.',
    ].join('\n'),
  };
}
