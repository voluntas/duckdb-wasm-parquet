import { expect, test } from '@playwright/test'

test('scan parquet', async ({ page }) => {
  await page.goto('http://localhost:5173/index.html')

  // ページが完全に読み込まれるのを待つ
  await page.waitForLoadState('networkidle')

  // 初期値が 0 であることを確認
  await expect(page.locator('#scanned')).toHaveText('Scanned: false')

  // 「Scan Parquet」ボタンをクリック
  await page.click('#scan-parquet')

  // true になるまで待機（最大10秒）
  await expect(page.locator('#scanned')).toHaveText('Scanned: true', { timeout: 30000 })

  // 「Samples」ボタンをクリック
  await page.click('#samples')

  // テーブルが表示されたことを確認
  await expect(page.locator('#result').locator('table')).toBeVisible()

  // 「Clear」ボタンをクリック
  await page.click('#clear')

  // テーブルがクリアされたことを確認
  await expect(page.locator('#result').locator('table')).not.toBeVisible()

  // 「Aggregation」ボタンをクリック
  await page.click('#aggregation')

  // テーブルが表示されたことを確認
  await expect(page.locator('#result').locator('table')).toBeVisible()

  await page.close()
})
