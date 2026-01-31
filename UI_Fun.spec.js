import { test, expect } from '@playwright/test';

test('UI_TC01: Translation input box is present and editable', async ({ page }) => {
  await page.goto('https://www.swifttranslator.com/');
  await page.waitForLoadState('networkidle');

  const inputBox = page.locator('textarea').first();
  
  // Check if input box is visible
  await expect(inputBox).toBeVisible();

  // Check if input box is enabled (editable)
  await expect(inputBox).toBeEditable();

  // Optional: type a sample text and check value
  await inputBox.fill('Test UI');
  expect(await inputBox.inputValue()).toBe('Test UI');
});