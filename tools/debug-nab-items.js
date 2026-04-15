/**
 * Dump pdfjs-dist text items for page 1 of the NAB PDF to diagnose y-coordinate structure.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const PDF_PATH = process.argv[2] || 'test-pdfs/7311-20220630-statement.pdf';
const PAGE = parseInt(process.argv[3] || '1');

async function getPdfjs() {
  const mod = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = mod.default ?? mod;
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = '';
  return pdfjs;
}

async function main() {
  const pdfjs = await getPdfjs();
  const buffer = readFileSync(PDF_PATH);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true, disableFontFace: true,
  }).promise;

  const page = await doc.getPage(PAGE);
  const content = await page.getTextContent();

  // Sort by Y descending (top-to-bottom), then X ascending (left-to-right)
  const items = content.items
    .filter(i => i.str.trim())
    .sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      return Math.abs(dy) > 1 ? dy : a.transform[4] - b.transform[4];
    });

  console.log(`Page ${PAGE}: ${items.length} text items\n`);
  console.log(`${'Y'.padEnd(8)} ${'X'.padEnd(8)} ${'W'.padEnd(8)} ${'RightEdge'.padEnd(12)} Text`);
  console.log('-'.repeat(70));

  let prevY = null;
  for (const item of items) {
    const y = Math.round(item.transform[5] * 100) / 100;
    const x = Math.round(item.transform[4] * 100) / 100;
    const w = Math.round((item.width || 0) * 100) / 100;
    const rEdge = Math.round((x + w) * 100) / 100;
    const gap = prevY !== null ? Math.round((prevY - y) * 100) / 100 : 0;
    const gapStr = gap > 0 ? ` [gap:${gap}]` : '';
    console.log(`${String(y).padEnd(8)} ${String(x).padEnd(8)} ${String(w).padEnd(8)} ${String(rEdge).padEnd(12)} ${item.str}${gapStr}`);
    prevY = y;
  }
}

main().catch(err => { console.error(err); process.exit(1); });
