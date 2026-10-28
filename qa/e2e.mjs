// QA B12: browser checks against the production build (static export in web/out/).
//
//   (cd web && npm run build && npm start)   # serves web/out on :3000
//   node qa/e2e.mjs [--url http://localhost:3000]   # base URL; the checks run on its /map/ page
//
// Prints one RESULT line per sub-check (12a..12i) and saves screenshots to qa/screens/.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://localhost:3000';
const MAP_URL = new URL('/map/', BASE).href;
const SHOTS = join(ROOT, 'qa', 'screens');
mkdirSync(SHOTS, { recursive: true });

const geo = JSON.parse(readFileSync(join(ROOT, 'web/public/data/segments.geojson'), 'utf8'));
const top1 = geo.features.find((f) => f.properties.rank === 1);
const P1 = top1.properties;
const results = [];
const result = (id, verdict, msg) => { results.push(verdict); console.log(`RESULT ${id}: ${verdict} - ${msg}`); };

// Point at fraction t of the line's length (lon/lat).
function pointAt(coords, t) {
  const seg = coords.slice(1).map((c, i) => Math.hypot((c[0] - coords[i][0]) * Math.cos((c[1] * Math.PI) / 180), c[1] - coords[i][1]));
  let half = seg.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) {
      const t = half / seg[i];
      return [coords[i][0] + t * (coords[i + 1][0] - coords[i][0]), coords[i][1] + t * (coords[i + 1][1] - coords[i][1])];
    }
    half -= seg[i];
  }
  return coords[coords.length - 1];
}
// Web Mercator pixel coords at zoom z (512 px tiles, as in maplibre).
function px([lon, lat], z) {
  const s = 512 * 2 ** z;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [((lon + 180) / 360) * s, ((1 - y / Math.PI) / 2) * s];
}

const browser = await chromium.launch();
try {
  // ── Desktop 1920x1080 ──────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // a) load + canvas within 5 s + no console errors
  const t0 = Date.now();
  await page.goto(MAP_URL, { waitUntil: 'domcontentloaded' });
  let canvasMs = null;
  try {
    await page.locator('canvas.maplibregl-canvas').waitFor({ state: 'visible', timeout: 5000 });
    canvasMs = Date.now() - t0;
  } catch { /* stays null */ }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.locator('section', { hasText: 'Top 10 priority streets' }).locator('tbody tr').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, '12a_desktop_loaded.png') });
  const errAfterLoad = [...errors];
  result('12a', canvasMs !== null && errAfterLoad.length === 0 ? 'PASS' : 'FAIL',
    `canvas visible after ${canvasMs ?? '>5000'} ms; console errors: ${errAfterLoad.length} ${JSON.stringify(errAfterLoad.slice(0, 3))}`);

  // b) no MOCK DATA badge
  const mockVisible = await page.getByText(/mock data/i).first().isVisible().catch(() => false);
  result('12b', mockVisible ? 'FAIL' : 'PASS', `"Mock data" badge visible: ${mockVisible}`);

  // c) exactly 10 rows, row 1 = rank-1 segment
  const rows = page.locator('section', { hasText: 'Top 10 priority streets' }).locator('tbody tr');
  const nRows = await rows.count();
  const cells = nRows ? await rows.first().locator('td').allInnerTexts() : [];
  const [rk, name, score, npts] = cells.map((s) => s.trim());
  const expectName = P1.name ?? 'Unnamed street';
  const row1ok = rk === '1' && Number(score) === P1.score && Number(npts) === P1.n_points;
  result('12c', nRows === 10 && row1ok ? 'PASS' : 'FAIL',
    `${nRows} rows; row 1 = [${cells.join(' | ')}]; data rank 1 = ${P1.id} (${expectName}, score ${P1.score}, n_points ${P1.n_points}). `
    + 'Rows carry no id attribute, so the id is matched via rank+score+n_points+name');

  // d) click row 1 -> card with score, confidence, n_points, >= 1 reason
  await rows.first().click();
  await page.waitForTimeout(2500); // flyTo
  // Card = the section with the close (×) button and the Measurements stat.
  const card = page.locator('section', { hasText: 'Measurements' }).filter({ has: page.getByRole('button', { name: '×' }) });
  const cardVisible = await card.first().isVisible().catch(() => false);
  const cardText = cardVisible ? await card.first().innerText() : '';
  const reasons = cardVisible ? await card.first().locator('li').count() : 0;
  const expectConf = `${(P1.confidence * 100).toFixed(0)}%`;
  const dOk = cardVisible && cardText.includes(P1.score.toFixed(1)) && cardText.includes(expectConf)
    && cardText.includes(String(P1.n_points)) && reasons >= 1;
  await page.screenshot({ path: join(SHOTS, '12d_row1_card.png') });
  result('12d', dOk ? 'PASS' : 'FAIL',
    `card visible ${cardVisible}; text: ${JSON.stringify(cardText.replace(/\s+/g, ' ').slice(0, 220))}; reasons ${reasons}`);

  // e) close the card, click the rank-1 line's geometric midpoint on the map
  // Try the midpoint first, then other points along the line; PASS only if the midpoint hits rank 1.
  await page.getByRole('button', { name: '×' }).first().click();
  await page.waitForTimeout(4000); // let flyTo finish
  const canvas = page.locator('canvas.maplibregl-canvas');
  const box = await canvas.boundingBox();
  const coords = top1.geometry.coordinates;
  const centre = coords[Math.floor(coords.length / 2)]; // MapView.applySelected flies here, zoom 16
  const [cx, cy] = px(centre, 16);
  const attempts = [];
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const [mx, my] = px(pointAt(coords, t), 16);
    const x = box.x + box.width / 2 + (mx - cx), y = box.y + box.height / 2 + (my - cy);
    await page.mouse.click(x, y);
    await page.waitForTimeout(1200);
    const open = await card.first().isVisible().catch(() => false);
    const text = open ? (await card.first().innerText()).replace(/\s+/g, ' ') : '';
    const hit = text.includes(P1.score.toFixed(1)) && text.includes(String(P1.n_points));
    attempts.push({ t, x: Math.round(x), y: Math.round(y), open, rank1: hit, card: text.slice(0, 60) });
    if (hit) break;
    if (open) { await page.getByRole('button', { name: '×' }).first().click(); await page.waitForTimeout(300); }
  }
  await page.screenshot({ path: join(SHOTS, '12e_map_click_card.png') });
  const first = attempts[0], anyHit = attempts.some((a) => a.rank1), anyOpen = attempts.some((a) => a.open);
  // A card for a different segment is a FAIL: the user clicked the #1 street and sees another one.
  result('12e', first.rank1 ? 'PASS' : 'FAIL',
    `clicks along rank-1 line: ${JSON.stringify(attempts)}; midpoint opens rank-1 card: ${first.rank1}; `
    + `any point opens rank-1: ${anyHit}; any card opened: ${anyOpen}`);

  // f) legend + "How we score"
  // level 2: the sidebar title (h1) has the same text as the legend heading (h2).
  const legend = await page.getByRole('heading', { name: 'Safety priority', level: 2 }).isVisible();
  const method = page.getByRole('button', { name: 'How we score' });
  const methodVisible = await method.isVisible();
  await method.click();
  const panel = await page.getByRole('region', { name: 'How the score works' }).isVisible();
  await page.screenshot({ path: join(SHOTS, '12f_method_open.png'), fullPage: true });
  await method.click();
  result('12f', legend && methodVisible && panel ? 'PASS' : 'FAIL',
    `legend heading visible ${legend}; "How we score" button ${methodVisible}; panel opens ${panel}`);

  // h) weight sliders re-rank live, Reset restores the published ranking
  const sliders = page.getByRole('slider');
  const nSliders = await sliders.count();
  const placeholderGone = !(await page.getByText('WeightSliders', { exact: true }).isVisible().catch(() => false));
  const row1 = async () => (await rows.first().locator('td').allInnerTexts()).map((s) => s.trim()).join(' | ');
  const before = await row1();
  await page.getByRole('slider', { name: 'Fine dust weight' }).fill('80');
  await page.waitForTimeout(800);
  const moved = await row1();
  await page.screenshot({ path: join(SHOTS, '12h_sliders_air80.png') });
  await page.getByRole('button', { name: 'Reset weights' }).click();
  await page.waitForTimeout(800);
  const reset = await row1();
  const hOk = nSliders === 5 && placeholderGone && moved !== before && reset === before;
  result('12h', hOk ? 'PASS' : 'FAIL',
    `${nSliders} sliders; placeholder gone ${placeholderGone}; row 1 default [${before}] -> fine dust 80% [${moved}] -> reset [${reset}]`);

  // g-desktop: nothing needs page scroll at 1920x1080
  await page.reload({ waitUntil: 'load' });
  await page.locator('section', { hasText: 'Top 10 priority streets' }).locator('tbody tr').first().waitFor();
  await page.waitForTimeout(1000);
  const dims = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
    return {
      scrollH: document.documentElement.scrollHeight, innerH: innerHeight,
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      map: r('canvas.maplibregl-canvas'), list: r('table'),
      method: (() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('How we score')); const q = b.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; })(),
    };
  });
  await page.screenshot({ path: join(SHOTS, '12g_desktop_1920x1080.png') });
  // The method toggle sits below the sliders in the sidebar's own scroll area; 12f checks it works.
  const allIn = [dims.map, dims.list].every((b) => b && b[1] <= dims.innerH);
  const gDesk = dims.scrollH <= dims.innerH && dims.scrollW <= dims.innerW && allIn;
  console.log(`  desktop dims ${JSON.stringify(dims)}`);

  // g-mobile: 375x812, list below the map
  const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  const mErrors = [];
  mp.on('console', (msg) => { if (msg.type() === 'error') mErrors.push(msg.text()); });
  await mp.goto(MAP_URL, { waitUntil: 'load' });
  await mp.locator('section', { hasText: 'Top 10 priority streets' }).locator('tbody tr').first().waitFor({ timeout: 15000 });
  await mp.waitForTimeout(4000); // map tiles + 6 MB GeoJSON take ~1-4 s to paint
  const mDims = await mp.evaluate(() => {
    const b = (e) => e.getBoundingClientRect();
    const map = b(document.querySelector('canvas.maplibregl-canvas'));
    const list = b(document.querySelector('table'));
    return { mapBottom: Math.round(map.bottom), listTop: Math.round(list.top), scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
  });
  await mp.screenshot({ path: join(SHOTS, '12g_mobile_375x812.png') });
  await mp.screenshot({ path: join(SHOTS, '12g_mobile_375x812_full.png'), fullPage: true });
  const gMob = mDims.listTop >= mDims.mapBottom && mDims.scrollW <= mDims.innerW;
  console.log(`  mobile dims ${JSON.stringify(mDims)}; mobile console errors ${mErrors.length}`);
  result('12g', gDesk && gMob ? 'PASS' : 'FAIL',
    `desktop: page scroll ${dims.scrollH}/${dims.innerH}, map/list inside viewport ${allIn}; `
    + `mobile: list top ${mDims.listTop} >= map bottom ${mDims.mapBottom}: ${gMob}, horizontal overflow ${mDims.scrollW > mDims.innerW}`);

  // Extra evidence: placeholder WeightSliders visible?
  const placeholder = await page.getByText('WeightSliders', { exact: true }).isVisible().catch(() => false);
  console.log(`  note: literal "WeightSliders" placeholder box visible on desktop: ${placeholder}`);
  console.log(`  total console errors during desktop run: ${errors.length} ${JSON.stringify(errors.slice(0, 5))}`);

  // i) accessibility: no serious or critical WCAG 2.1 A/AA violations (axe) on the public pages
  const axeFindings = [];
  for (const path of ['/', '/map/', '/imprint/', '/privacy/']) {
    await page.goto(new URL(path, BASE).href, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
      axeFindings.push(`${path} ${v.id} (${v.impact}, ${v.nodes.length}x: ${v.nodes[0].target.join(' ')})`);
    }
  }
  result('12i', axeFindings.length ? 'FAIL' : 'PASS',
    `serious/critical axe violations: ${axeFindings.length} ${JSON.stringify(axeFindings)}`);

  await m.close();
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(results.includes('FAIL') ? 1 : 0);
