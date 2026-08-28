#!/usr/bin/env node
/**
 * reference/go2joy-hotel-admin-kb.md → bulk-import CSV (PLN-260828 S3).
 *
 * The manual is already written as task-unit KB articles (`## GTJ-XXX-NN ·
 * 제목 (Title)`); this slices each article into one CSV row for the
 * OperationInfo bulk importer, keyed by the article ID so re-running the
 * import updates rather than duplicates. The glossary and status-value
 * sections ride along as two reference articles; the open-items list and the
 * change log are document meta, not knowledge, and stay out.
 *
 * Usage: node scripts/convert-go2joy-kb.mjs [input.md] [output.csv]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2] ?? 'reference/go2joy-hotel-admin-kb.md';
const output = process.argv[3] ?? 'go2joy-operation-kb.csv';

/** Article-ID prefix → console category (the manual's own 영역 column). */
const CATEGORY_BY_PREFIX = {
  DSH: '대시보드',
  REV: '리뷰 관리',
  DIS: '객실 유형 관리',
  FLS: '객실 유형 관리',
  SUR: '객실 유형 관리',
  QLK: '객실 유형 관리',
  LCK: '객실 유형 관리',
  RPT: '리포트',
};

const lines = readFileSync(input, 'utf8').split('\n');

// One pass, heading-driven: an article starts at `## GTJ-…` / `### GTJ-…` and
// ends at the next heading of any level (the `---` rules are decoration).
const articles = [];
let current = null;
const flush = () => {
  if (!current) return;
  current.content = current.body
    .join('\n')
    .replace(/\n?---\s*$/g, '')
    .trim();
  articles.push(current);
  current = null;
};

const ARTICLE = /^#{2,3}\s+(GTJ-([A-Z]+)-\d+)\s+·\s+(.+)$/;
// The two appendix sections that are knowledge in their own right.
const APPENDIX = {
  '# 5. 용어집 (Glossary)': { key: 'GTJ-GLS-01', title: '용어집 (Glossary)' },
  '# 6. 상태 값 정의 (Status Values)': { key: 'GTJ-STA-01', title: '상태 값 정의 (Status Values)' },
};

// Headings that END an article: a chapter (`# 4. 리포트`) or a numbered
// grouping (`## 3.2 플래시 세일 설정`). Anything else — `### 1) 예약 개요`
// inside the dashboard article, `## 직접 할인 프로그램 상태` inside the
// status appendix — is the article's own structure and stays in the body.
const BOUNDARY = /^(#\s|##\s+\d+\.\d+)/;

for (const line of lines) {
  const article = line.match(ARTICLE);
  const appendix = APPENDIX[line.trim()];

  if (article) {
    flush();
    const category = CATEGORY_BY_PREFIX[article[2]];
    if (!category) throw new Error(`unknown article prefix in "${line}"`);
    current = { key: article[1], title: article[3].trim(), category, body: [] };
    continue;
  }
  if (appendix) {
    flush();
    current = { ...appendix, category: '참고자료', body: [] };
    continue;
  }
  if (BOUNDARY.test(line)) {
    flush();
    continue;
  }
  if (current) current.body.push(line);
}
flush();

if (articles.length === 0) throw new Error('no articles found — did the manual format change?');

const esc = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const rows = [
  'category,title,content,external_key',
  ...articles.map((a) => [a.category, a.title, a.content, a.key].map(esc).join(',')),
];
// BOM so the file also opens cleanly in Excel for review.
writeFileSync(output, '﻿' + rows.join('\n') + '\n', 'utf8');

console.log(`${articles.length} articles → ${output}`);
for (const a of articles) console.log(`  ${a.key}  [${a.category}] ${a.title} (${a.content.length} chars)`);
