import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    // 開発サーバー用の設定
    return { base: '/' }
  }
  // ビルド用の設定
  return {
    base: '/duckdb-wasm-parquet/',
  }
})
