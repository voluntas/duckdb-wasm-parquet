import { expect, test } from '@playwright/test'

test('scan parquet', async ({ page }) => {
  await page.goto('http://localhost:5173/index.html')
  await page.click('#scan-parquet')
})
