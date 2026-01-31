// @ts-check
const { test, expect } = require('@playwright/test');

const SITE = 'https://www.swifttranslator.com/';

/* ---------------- Shared helpers ---------------- */

const normalize = (s) =>
  (s ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200D\u2060]/g, '') // zero-width
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
  await inputField.press('Enter');
}

function getSinhalaOutput(page) {
  return page.locator('text=Sinhala').locator('..').locator('div').nth(1);
}

async function readSinhalaWhenReady(page) {
  const out = getSinhalaOutput(page);
  await expect(out).toBeVisible();
  await expect
    .poll(async () => {
      const t = await out.innerText();
      return /[\u0D80-\u0DFF]/.test(t) ? normalize(t) : '';
    }, { timeout: 10000, intervals: [200, 300, 500, 800, 1000] })
    .not.toBe('');
  return normalize(await out.innerText());
}

async function typeSinglishAndTranslate(page, text) {
  const input = await getSinglishInput(page);
  await input.fill('');
  await input.pressSequentially(text, { delay: 30 });
  await clickTranslateIfAny(page, input);
}

/* ---------------- Negative dataset (assert IDEAL -> fail today) ---------------- */

const neg = [
  {
    id: 'Neg_Fun_0001',
    title: 'Joined words not separated',
    input: 'mamageDharayanavaa',
    expected: 'මම ගෙදර යනවා',
  },
  {
    id: 'Neg_Fun_0003',
    title: 'Negative meaning weakened',
    input: 'mata eeka karanna baee',
    expected: 'මට ඒක කරන්න බැහැ',
  },
  {
    id: 'Neg_Fun_0025',
    title: 'Joined words cause incorrect conversion',
    input: 'matabahtkanna oone.',
    expected: 'මට බත් කන්න ඕනේ.',
  },
  {
    id: 'Neg_Fun_0026',
    title: 'Spelling errors affect conversion',
    input: 'mama gdhra ynwa',
    expected: 'මම ගෙදර යනවා',
  },
  {
    id: 'Neg_Fun_0027a',
    title: 'Excessive special characters (symbols around words)',
    input: 'mama@#$$% gedhara ^&&* inne!!!!',
    expected: 'මම ගෙදර ඉන්නේ',
  },
  {
    id: 'Neg_Fun_0027b',
    title: 'Excessive special characters (prefix/suffix)',
    input: '@@ mama gedhara !!!',
    expected: 'මම ගෙදර ඉන්නේ',
  },
  {
    id: 'Neg_Fun_0028',
    title: 'Empty input',
    input: '',
    expected: 'කරුණාකර සින්ග්ලිෂ් පාඨය යොදන්න', // ideal UX message; forces failure today
  },
  {
    id: 'Neg_Fun_0029',
    title: 'English-dominant sentence',
    input: 'meeting schedule finalize karala share karanna',
    expected: 'මීටින්ග් කාලසටහන අවසන් කරලා බෙදාහරින්න',
  },
  {
    id: 'Neg_Fun_0030',
    title: 'Repeated characters',
    input: 'mama gedhara ineeeee',
    expected: 'මම ගෙදර ඉන්නේ',
  },
  {
    id: 'Neg_Fun_0031',
    title: 'No spacing between sentences',
    input: 'mama gedharainneo yaa kohomadha',
    expected: 'මම ගෙදර ඉන්නේ. ඔයා කොහොමද?',
  },
  {
    id: 'Neg_Fun_0032',
    title: 'Incorrect tense combination',
    input: 'mama gedharainne oyaa kohomadha',
    expected: 'මම ගෙදර ඉන්නේ ඔයා කොහොමද',
  },
  {
    id: 'Neg_Fun_0033',
    title: 'Emojis in input',
    input: 'mama gedhara inne 😊',
    expected: 'මම ගෙදර ඉන්නේ 😊',
  },
  {
    id: 'Neg_Fun_0034',
    title: 'Long input without punctuation',
    input:
      'mama university eka yanavaa adhyapana weda hari amarui habai api issarahata yanna ona nam danma yamu kiyala hithenava',
    expected:
      'මම විශ්වවිද්‍යාලයෙට යනවා. අධ්‍යාපන වැඩ බරපතලයි, හැබැයි අපි ඉදිරියට යන්න ඕන නම් දැන්නම යමු කියලා හිතෙනවා.',
  },
];

/* ---------------- Runner ---------------- */

test.describe('SwiftTranslator – Negative cases (assert ideal behavior; current bugs should FAIL)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  });

  for (const tc of neg) {
    test(`${tc.id}: ${tc.title}`, async ({ page }, testInfo) => {
      await typeSinglishAndTranslate(page, tc.input);
      const actual = await readSinhalaWhenReady(page);

      await testInfo.attach(`${tc.id}-actual.txt`, {
        body: `Input: ${tc.input}\nActual: ${actual}\nExpected: ${tc.expected}\n`,
        contentType: 'text/plain',
      });
      await testInfo.attach(`${tc.id}-screenshot.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });

      // STRICT: these should fail until the app behaves ideally.
      await expect(getSinhalaOutput(page)).toHaveText(tc.expected, { timeout: 7000 });
    });
  }
});
