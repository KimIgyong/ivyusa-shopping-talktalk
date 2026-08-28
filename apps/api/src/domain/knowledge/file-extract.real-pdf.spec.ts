import { execFileSync } from 'child_process';
import { join } from 'path';

/**
 * UNMOCKED pdf-parse against a real (13KB, committed) PDF. Exists because the
 * mocked suite happily passed while the code called pdf-parse's retired v1
 * function API and every real PDF failed with E5067 — an API-shape regression
 * only a real parse can catch.
 *
 * Runs in a CHILD node process: pdf-parse v2 bundles pdfjs' legacy build,
 * which trips over jest's sandboxed globals while running fine under plain
 * node — the runtime the API actually uses.
 */
describe('extractText — real PDF (child process)', () => {
  it('reads the committed fixture through the actual parser', () => {
    const fixture = join(__dirname, '__fixtures__', 'ingest-fixture.pdf');
    const script = `
      const { PDFParse } = require('pdf-parse');
      const { readFileSync } = require('fs');
      (async () => {
        const p = new PDFParse({ data: new Uint8Array(readFileSync(process.argv[1])) });
        const r = await p.getText();
        process.stdout.write(r.text);
        await p.destroy();
      })().catch((e) => { console.error(e.message); process.exit(1); });
    `;
    const out = execFileSync(process.execPath, ['-e', script, fixture], {
      cwd: join(__dirname, '..', '..', '..'), // apps/api — resolves the workspace dependency
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(out).toContain('Refunds are accepted within 7 days');
  });
});
