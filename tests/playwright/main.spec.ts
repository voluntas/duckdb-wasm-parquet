import { expect, test } from '@playwright/test'

test('scan parquet', async ({ page }) => {
  await page.goto('http://localhost:5173/index.html')
  // 初期値が0であることを確認
  await expect(page.locator('#scanned')).toHaveText('Scanned: false')

  // 「Scan Parquet」ボタンをクリック
  await page.click('#scan-parquet')

  // true になるまで待機（最大10秒）
  await expect(page.locator('#scanned')).toHaveText('Scanned: true', { timeout: 30000 })

  // 「load table」ボタンをクリック
  await page.click('#load-table')

  // テーブルが読み込まれたことを確認
  await expect(page.locator('#table')).toBeVisible()
})
