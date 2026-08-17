#!/usr/bin/env node
/**
 * Translation completeness gate (REQ-260817 G11).
 *
 * Every i18n lookup in this repo ends in a fallback to English, which is the
 * right runtime behaviour and the wrong development one: a key nobody
 * translated does not throw, it just quietly serves English until a user
 * reports it. This walks all four apps' locale resources, compares each
 * language against the English baseline, and exits non-zero on any missing key,
 * stray key, or empty string.
 *
 *   npm run i18n:check            report everything
 *   npm run i18n:check -- --lang vi   one language
 *   npm run i18n:check -- --quiet     summary only (counts, no key lists)
 *
 * Locale files are TypeScript modules, so they are compiled with esbuild (a
 * dependency we already have via Vite) and imported as data: URLs rather than
 * parsed by hand — a regex over object literals would drift the moment someone
 * adds a template string.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = 'en';

const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const onlyLang = argv.includes('--lang') ? argv[argv.indexOf('--lang') + 1] : null;
const MAX_LISTED = 15;

/** Language codes come from the registry, so the checker cannot drift from it. */
async function supportedLanguages() {
  const src = await readFile(path.join(ROOT, 'packages/types/src/common/language.ts'), 'utf8');
  const mod = await importTs(src);
  return mod.LANGUAGES.map((l) => l.code);
}

/** Compile TS source and import it, with no file written to disk. */
async function importTs(source) {
  const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return import(url);
}

/** The translation object a locale module exports: `export default` or the first object export. */
function pickResource(mod) {
  if (mod.default && typeof mod.default === 'object') return mod.default;
  const found = Object.values(mod).find((v) => v && typeof v === 'object');
  if (!found) throw new Error('no translation object exported');
  return found;
}

/** Flatten to dotted paths so nesting differences surface as key differences. */
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

/**
 * One comparable unit: an app (+ namespace, for the console) and a loader per
 * language. Returns null for a language whose file does not exist yet, which is
 * reported as "file missing" rather than as ~200 missing keys.
 */
async function collectTargets() {
  const targets = [];

  // Console — one JSON file per namespace per language.
  const webLocales = path.join(ROOT, 'apps/web/src/i18n/locales');
  for (const file of await readdir(path.join(webLocales, BASELINE))) {
    if (!file.endsWith('.json')) continue;
    targets.push({
      app: 'web',
      unit: file.replace(/\.json$/, ''),
      load: async (lang) => {
        const p = path.join(webLocales, lang, file);
        if (!existsSync(p)) return null;
        return JSON.parse(await readFile(p, 'utf8'));
      },
    });
  }

  // Widget / mobile / PWA — one TS module per language.
  for (const app of ['widget', 'mobile', 'pwa']) {
    const dir = path.join(ROOT, `apps/${app}/src/i18n/locales`);
    if (!existsSync(dir)) continue;
    targets.push({
      app,
      unit: 'translation',
      load: async (lang) => {
        const p = path.join(dir, `${lang}.ts`);
        if (!existsSync(p)) return null;
        return pickResource(await importTs(await readFile(p, 'utf8')));
      },
    });
  }

  return targets;
}

function list(keys) {
  const shown = keys.slice(0, MAX_LISTED).join(', ');
  return keys.length > MAX_LISTED ? `${shown} … (+${keys.length - MAX_LISTED})` : shown;
}

async function main() {
  const languages = (await supportedLanguages()).filter((l) => l !== BASELINE);
  const wanted = onlyLang ? languages.filter((l) => l === onlyLang) : languages;
  if (onlyLang && wanted.length === 0) {
    console.error(`Unknown language '${onlyLang}'. Registered: ${languages.join(', ')}`);
    process.exit(2);
  }

  const targets = await collectTargets();
  const problems = [];
  const summary = new Map(wanted.map((l) => [l, { missing: 0, extra: 0, empty: 0, absent: 0 }]));

  for (const target of targets) {
    const base = flatten(await target.load(BASELINE));
    for (const lang of wanted) {
      const label = `${target.app}/${target.unit} [${lang}]`;
      const resource = await target.load(lang);
      const tally = summary.get(lang);

      if (resource == null) {
        tally.absent += 1;
        problems.push(`${label}: locale file missing (${base.size} keys untranslated)`);
        continue;
      }

      const actual = flatten(resource);
      const missing = [...base.keys()].filter((k) => !actual.has(k));
      const extra = [...actual.keys()].filter((k) => !base.has(k));
      const empty = [...actual.entries()]
        .filter(([, v]) => typeof v === 'string' && v.trim() === '')
        .map(([k]) => k);

      tally.missing += missing.length;
      tally.extra += extra.length;
      tally.empty += empty.length;

      if (missing.length) problems.push(`${label}: ${missing.length} missing — ${list(missing)}`);
      if (extra.length) problems.push(`${label}: ${extra.length} not in ${BASELINE} — ${list(extra)}`);
      if (empty.length) problems.push(`${label}: ${empty.length} empty — ${list(empty)}`);
    }
  }

  if (!quiet) for (const line of problems) console.log(line);

  console.log('\ni18n completeness vs. English baseline');
  let failed = false;
  for (const [lang, t] of summary) {
    const bad = t.missing + t.extra + t.empty + t.absent;
    if (bad) failed = true;
    console.log(
      `  ${lang}: ${bad === 0 ? 'complete' : `${t.missing} missing, ${t.extra} stray, ${t.empty} empty` +
        (t.absent ? `, ${t.absent} file(s) absent` : '')}`,
    );
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
