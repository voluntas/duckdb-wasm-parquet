import { expect, test } from '@playwright/test'

test('scan parquet', async ({ page }) => {
  await page.goto('http://localhost:5173/index.html')

  // ページが完全に読み込まれるのを待つ
  await page.waitForLoadState('networkidle')

  // 初期値が0であることを確認
  await expect(page.locator('#scanned')).toHaveText('Scanned: false')

  // 「Scan Parquet」ボタンをクリック
  await page.click('#scan-parquet')

  // true になるまで待機（最大10秒）
  await expect(page.locator('#scanned')).toHaveText('Scanned: true', { timeout: 30000 })

  // 「load table」ボタンをクリック
  await page.click('#load-table')

  // #result に table エレメントが div に追加されるか
  await expect(page.locator('#result').locator('table')).toBeVisible()

  // 一回テーブル削除する
  await page.click('#clear')

  // #result から テーブルが削除されたことを確認する
  await expect(page.locator('#result').locator('table')).not.toBeVisible()

  await page.click('#aggregation')

  await expect(page.locator('#result').locator('table')).toBeVisible()

  await page.close()
})
