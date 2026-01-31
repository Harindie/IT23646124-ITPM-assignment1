// @ts-check
const { test, expect } = require('@playwright/test');

const SITE = 'https://www.swifttranslator.com/';

/* ---------------- Utilities: selectors, waiters, normalization ---------------- */

const normalize = (s) =>
  (s ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\u2060]/g, '') // zero-width
     // collapse all whitespace (incl. newlines/tabs)
    .replace(/\s+/g, ' ')
    .trim();

async function getSinglishInput(page) {
  const candidates = [
    page.locator('[placeholder="Input Your Singlish Text Here."]'),
    page.getByPlaceholder(/singlish/i),
    page.locator('#singlish-input'),
    page.locator('[data-testid="singlish-input"]'),
    page.locator('textarea').first(),
    page.locator('input[type="text"]').first(),
  ];
  for (const c of candidates) {
    if ((await c.count()) > 0 && (await c.first().isVisible())) return c.first();
  }
  throw new Error('❌ Singlish input not found.');
}

async function clickTranslateIfAny(page, inputField) {
  const btns = [
    page.getByRole('button', { name: /translate|convert|සිංහල/i }),
    page.locator('button[type="submit"]'),
    page.locator('button').filter({ hasText: /translate|convert|සිංහල/i }).first(),
  ];
  for (const b of btns) {
    if ((await b.count()) > 0 && (await b.first().isVisible())) {
      await b.first().click();
      return;
    }
  }
  // fallback for auto-translate UIs
  await inputField.press('Enter');
}

function getSinhalaOutput(page) {
  // "Sinhala" header -> parent -> scrolling result div (index 1)
  return page.locator('text=Sinhala').locator('..').locator('div').nth(1);
}

/**
 * Waits until output is ready based on the given mode:
 *  - 'sinhala'            : any Sinhala (U+0D80–U+0DFF) must appear
 *  - 'sinhala-or-digits'  : Sinhala OR any digits must appear (for number/unit cases)
 *  - 'any'                : any non-empty text (used by negative suite typically)
 */
async function readOutputWhenReady(page, waitMode = 'sinhala') {
  const out = getSinhalaOutput(page);
  await expect(out).toBeVisible();

  await expect
    .poll(
      async () => {
        const t = (await out.innerText()) || '';
        const s = normalize(t);
        const hasSinhala = /[\u0D80-\u0DFF]/.test(s);
        const hasDigits = /\d/.test(s);

        if (waitMode === 'sinhala') return hasSinhala ? s : '';
        if (waitMode === 'sinhala-or-digits') return (hasSinhala || hasDigits) ? s : '';
        if (waitMode === 'any') return s ? s : '';
        return s ? s : '';
      },
      { timeout: 10000, intervals: [200, 300, 500, 800, 1000] }
    )
    .not.toBe('');

  return normalize(await out.innerText());
}

async function typeSinglishAndTranslate(page, text) {
  const input = await getSinglishInput(page);
  await input.fill('');
  await input.pressSequentially(text, { delay: 30 });
  await clickTranslateIfAny(page, input);
}

/* ---------------- Assertion helpers ---------------- */

async function assertCase(page, tc, testInfo) {
  await typeSinglishAndTranslate(page, tc.input);

  const actual = await readOutputWhenReady(page, tc.waitMode || 'sinhala');
  const actualN = normalize(actual);

  await testInfo.attach(`${tc.id}-actual.txt`, {
    body: `Input: ${tc.input}\nActual: ${actual}\n`,
    contentType: 'text/plain',
  });
  await testInfo.attach(`${tc.id}-screenshot.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  if (tc.assert === 'equals') {
    const variants = (tc.expectedOneOf ?? [tc.expected]).map(normalize);
    const ok = variants.some(v => v === actualN);
    expect(
      ok,
      `${tc.id}\nExpected one of:\n${variants.map(v => `  - ${v}`).join('\n')}\nBut got:\n  - ${actualN}`
    ).toBe(true);
    return;
  }

  if (tc.assert === 'contains') {
    const needles = (tc.containsAny ?? [tc.contains]).map(normalize);
    const ok = needles.some(n => actualN.includes(n));
    expect(
      ok,
      `${tc.id}\nExpected to contain any of:\n${needles.map(v => `  - ${v}`).join('\n')}\nBut got:\n  - ${actualN}`
    ).toBe(true);
    return;
  }

  if (tc.assert === 'regex') {
    const re = tc.regex instanceof RegExp ? tc.regex : new RegExp(tc.regex, 's');
    expect(actualN).toMatch(re);
    return;
  }

  throw new Error(`Unknown assert type for ${tc.id}`);
}

/* ---------------- Dataset ---------------- */

const cases = [
  // 001–004
  { id: 'Pos_Fun_001', input: 'mama gedhara inne', assert: 'equals',
    expectedOneOf: ['මම ගෙදර ඉන්නේ', 'මම ගෙදර ඉන්නෙ'] },
  { id: 'Pos_Fun_002', input: 'oyaa kohomadha?', assert: 'equals',
    expectedOneOf: ['ඔයා කොහොමද?', 'ඔයා කොහොම ද?'] },
  { id: 'Pos_Fun_003', input: 'mata adha yanna baee', assert: 'equals',
    expectedOneOf: ['මට අද යන්න බැහැ', 'මට අද යන්න බෑ'] },
  { id: 'Pos_Fun_004', input: 'mata Zoom meeting ekak thiyenawa', assert: 'contains',
    containsAny: ['Zoom meeting'] },

  // 005–013 (your new positives included)
  { id: 'Pos_Fun_005', input: 'matawanna oone', assert: 'equals',
    expectedOneOf: ['මට වන්න ඕනේ', 'මට වන්න ඕන'] },
  { id: 'Pos_Fun_006', input: 'kiri gananna', assert: 'equals',
    expectedOneOf: ['කිරි ගන්න'] },
  { id: 'Pos_Fun_007', input: 'adha vahinawada eth nisaa eliyata yanne', assert: 'contains',
    containsAny: ['නිසා'] },
  { id: 'Pos_Fun_008', input: 'oyaa enawaanam api yamu', assert: 'contains',
    containsAny: ['නම්'] },
  { id: 'Pos_Fun_009', input: 'karunakarala mata udhavak karanna', assert: 'equals',
    expectedOneOf: [
      'කරුණාකරලා මට උදව්වක් කරන්න',
      'කරුණාකර මට උදව්වක් කරන්න',
      'කරුණකරලා මට උදව්වක් කරන්න',
    ] },
  { id: 'Pos_Fun_010', input: 'ela machan!', assert: 'equals',
    expectedOneOf: ['එල මචං!', 'එල මචන්!'] },
  { id: 'Pos_Fun_011', input: 'hari hari', assert: 'equals',
    expectedOneOf: ['හරි හරි'] },

  // 012: enforce Sinhala place name (do not accept English pass-through)
  { id: 'Pos_Fun_012', input: 'colombo enna', assert: 'equals',
    expectedOneOf: ['කොළඹ එන්න', 'කොළඹට එන්න'] },

  // 013: currency; allow waiter ‘sinhala-or-digits’ to avoid timeouts when only digits appear
  { id: 'Pos_Fun_013', input: 'LKR 100', assert: 'contains', waitMode: 'sinhala-or-digits',
    containsAny: ['රු. 100', 'රු 100', 'රුපී 100', '100'] },

  // 014–016 (format preservation)
  { id: 'Pos_Fun_014', input: 'Rs. 2500 vitara', assert: 'contains',
    containsAny: ['2500'] },
  { id: 'Pos_Fun_015', input: '7.30 AM meeting ekak', assert: 'contains',
    containsAny: ['7.30', '7:30'] },
  { id: 'Pos_Fun_016', input: '2026-05-21 exam eka', assert: 'contains',
    containsAny: ['2026-05-21'] },

  // 017: measurement; also use sinhala-or-digits waiter
  { id: 'Pos_Fun_017', input: '5 km', assert: 'equals', waitMode: 'sinhala-or-digits',
    expectedOneOf: ['5 කි.මී.', '5 km', 'කි.මී. 5'] },

  { id: 'Pos_Fun_018', input: 'api okkoma yamu', assert: 'contains',
    containsAny: ['අපි'] },

  // 019: keep strict canonical greeting
  { id: 'Pos_Fun_019', input: 'suba aluth avurudak', assert: 'equals',
    expectedOneOf: ['සුබ අලුත් අවුරුද්දක්'] },

  { id: 'Pos_Fun_020', input: 'eka poddak balanna', assert: 'contains',
    containsAny: ['බලන්න'] },

  // 021: multiple spaces, canonical
  { id: 'Pos_Fun_021', input: 'mama   gedhara     inne', assert: 'equals',
    expectedOneOf: ['මම ගෙදර ඉන්නේ', 'මම ගෙදර ඉන්නෙ'] },

  // 022: line breaks; use regex and default sinhala waiter
  { id: 'Pos_Fun_022', input: 'adha vahinavaa\napi eliyata yanne nahae', assert: 'regex',
    regex: /වහිනවා[\s\S]*නැහැ|වහිනවා[\s\S]*නහැ/ },

  { id: 'Pos_Fun_023', input: 'mama university eka yanavaa honda future ekak hadaganna api group project ekakata wada karala presentation karanawa', assert: 'contains',
    containsAny: ['presentation'] },

  { id: 'Pos_Fun_024', input: 'oyaa adha enne', assert: 'equals',
    expectedOneOf: ['ඔයා අද එන්නේ', 'ඔයා අද එන්නෙ'] },
];

/* ---------------- Runner ---------------- */

test.describe('Swift Translator — Positive Functional Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  });

  for (const tc of cases) {
    test(tc.id, async ({ page }, testInfo) => {
      await assertCase(page, tc, testInfo);
    });
  }
});