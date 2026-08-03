import {
  PASSWORD_RULE,
  generateTempPassword,
  validatePassword,
} from './password-policy.util';
import {
  PASSWORD_MIN_CHAR_CLASSES,
  PASSWORD_MIN_LENGTH,
} from '../constant/security.constant';

describe('password-policy.util (Stage 3 — POL-018)', () => {
  it('exposes the approved policy constants', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MIN_CHAR_CLASSES).toBe(3);
  });

  describe('min_length boundary', () => {
    it('fails at 11 chars', () => {
      const r = validatePassword('Zr8!kQw2Pl0'); // 11
      expect(r.ok).toBe(false);
      expect(r.failed).toContain(PASSWORD_RULE.MIN_LENGTH);
    });

    it('passes at exactly 12 chars', () => {
      const r = validatePassword('Zr8!kQw2Pl0x'); // 12
      expect(r.failed).not.toContain(PASSWORD_RULE.MIN_LENGTH);
      expect(r.ok).toBe(true);
    });
  });

  describe('char_classes counting', () => {
    it('fails with a single class', () => {
      const r = validatePassword('nvqhrmzkeplw');
      expect(r.failed).toContain(PASSWORD_RULE.CHAR_CLASSES);
    });

    it('fails with two classes (lower+digit)', () => {
      const r = validatePassword('nvqhrmzk3957');
      expect(r.failed).toContain(PASSWORD_RULE.CHAR_CLASSES);
    });

    it('passes with three classes (lower+upper+digit)', () => {
      const r = validatePassword('NvqHrmzk3957');
      expect(r.failed).not.toContain(PASSWORD_RULE.CHAR_CLASSES);
      expect(r.ok).toBe(true);
    });

    it('counts specials as a class (lower+digit+special)', () => {
      const r = validatePassword('nvqhrmzk39!!');
      expect(r.failed).not.toContain(PASSWORD_RULE.CHAR_CLASSES);
    });
  });

  describe('common_password blocklist', () => {
    it('rejects an exact common password (case-insensitive)', () => {
      const r = validatePassword('QwertyUiop12');
      expect(r.failed).toContain(PASSWORD_RULE.COMMON_PASSWORD);
      expect(r.ok).toBe(false);
    });

    it('rejects a digit/special-decorated common password via its alpha core', () => {
      // "Password123!" -> lowercase minus digits/specials = "password"
      const r = validatePassword('Password123!');
      expect(r.failed).toContain(PASSWORD_RULE.COMMON_PASSWORD);
    });

    it('rejects a year-suffixed brand term via its alpha core', () => {
      const r = validatePassword('Sunshine2026!');
      expect(r.failed).toContain(PASSWORD_RULE.COMMON_PASSWORD);
    });

    it('rejects project/brand terms (amb2026 seed pattern, exact lowercase match)', () => {
      const r = validatePassword('AMB2026');
      expect(r.failed).toContain(PASSWORD_RULE.COMMON_PASSWORD);
      expect(r.failed).toContain(PASSWORD_RULE.MIN_LENGTH);
    });

    it('rejects a decorated brand term via its alpha core (ivyusa)', () => {
      const r = validatePassword('IvyUsa#2026!!');
      expect(r.failed).toContain(PASSWORD_RULE.COMMON_PASSWORD);
    });

    it('accepts an uncommon strong password', () => {
      const r = validatePassword('Grapefruit-Lantern-7Q');
      expect(r.failed).not.toContain(PASSWORD_RULE.COMMON_PASSWORD);
      expect(r.ok).toBe(true);
    });
  });

  describe('contains_identity', () => {
    it('rejects a password containing the email local-part (case-insensitive)', () => {
      const r = validatePassword('XyGraceKim99!!', { email: 'gracekim@ivyusa.com' });
      expect(r.failed).toContain(PASSWORD_RULE.CONTAINS_IDENTITY);
    });

    it('rejects a password containing a local-part token split on separators', () => {
      const r = validatePassword('xx-GRACE-zz99!Q', { email: 'grace.kim@ivyusa.com' });
      expect(r.failed).toContain(PASSWORD_RULE.CONTAINS_IDENTITY);
    });

    it('ignores identity fragments shorter than 4 chars', () => {
      const r = validatePassword('Dev4Zr8!kQw2Pl', { email: 'dev@amoeba.group' });
      expect(r.failed).not.toContain(PASSWORD_RULE.CONTAINS_IDENTITY);
    });

    it('rejects a password containing a name token', () => {
      const r = validatePassword('ILikeJonathanA1!', { name: 'Jonathan Park' });
      expect(r.failed).toContain(PASSWORD_RULE.CONTAINS_IDENTITY);
    });

    it('does not run without ctx', () => {
      const r = validatePassword('XyGraceKim99!!');
      expect(r.failed).not.toContain(PASSWORD_RULE.CONTAINS_IDENTITY);
    });
  });

  describe('same_as_current', () => {
    it('rejects reuse of the current password when the plain is provided', () => {
      const r = validatePassword('Zr8!kQw2Pl0x', { currentPasswordPlain: 'Zr8!kQw2Pl0x' });
      expect(r.failed).toEqual([PASSWORD_RULE.SAME_AS_CURRENT]);
    });

    it('is skipped when the current plain is not provided', () => {
      const r = validatePassword('Zr8!kQw2Pl0x', { email: 'ops@example.com' });
      expect(r.ok).toBe(true);
    });
  });

  describe('unicode / space handling', () => {
    it('treats spaces as the special class (passphrase style)', () => {
      const r = validatePassword('korrekt hors 7 batt');
      expect(r.ok).toBe(true); // lower + digit + special(space)
    });

    it('treats non-ASCII letters as the special class', () => {
      const r = validatePassword('비밀번호테스트Ab34'); // special + upper + lower + digit
      expect(r.failed).not.toContain(PASSWORD_RULE.CHAR_CLASSES);
      expect(r.failed).toContain(PASSWORD_RULE.MIN_LENGTH); // 11 UTF-16 units — still short
    });

    it('reports every failed rule, not just the first', () => {
      const r = validatePassword('password1');
      expect(r.failed).toEqual(
        expect.arrayContaining([
          PASSWORD_RULE.MIN_LENGTH,
          PASSWORD_RULE.CHAR_CLASSES,
          PASSWORD_RULE.COMMON_PASSWORD,
        ]),
      );
    });
  });

  describe('generateTempPassword', () => {
    it('always produces a policy-passing password (100 rolls)', () => {
      for (let i = 0; i < 100; i += 1) {
        const pw = generateTempPassword();
        expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
        expect(validatePassword(pw).ok).toBe(true);
      }
    });
  });
});
