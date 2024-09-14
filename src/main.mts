import * as duckdb from '@duckdb/duckdb-wasm'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
}

document.addEventListener('DOMContentLoaded', async () => {
  const PARQUET_FILE_URL = import.meta.env.VITE_PARQUET_FILE_URL
  const scanParquetButton = document.getElementById('scan-parquet') as HTMLButtonElement | null
  const samplesButton = document.getElementById('samples') as HTMLButtonElement | null
  const aggregationButton = document.getElementById('aggregation') as HTMLButtonElement | null
  const clearButton = document.getElementById('clear') as HTMLButtonElement | null

  // すべてのボタンを初期状態で無効化
  for (const button of [scanParquetButton, samplesButton, aggregationButton, clearButton]) {
    if (button) button.disabled = true
  }

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
  const worker = new Worker(bundle.mainWorker ?? '')
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  const conn = await db.connect()
  await conn.query(`
    INSTALL parquet;
    LOAD parquet;
    INSTALL json;
    LOAD json;
  `)
  await conn.close()

  // DuckDBの初期化が完了したらボタンを有効化
  if (scanParquetButton) {
    scanParquetButton.disabled = false
  }

  document.getElementById('scan-parquet')?.addEventListener('click', async () => {
    let buffer = await getBufferFromIndexedDB()

    if (!buffer) {
      // IndexedDBにデータがない場合、ダウンロードして保存
      // parquet ファイルをダウンロードする
      const response = await fetch(PARQUET_FILE_URL)
      buffer = await response.arrayBuffer()
      // rtc_stats.parquet という名前でバッファを登録する
      await saveBufferToIndexedDB(buffer)
    }

    await db.registerFileBuffer('rtc_stats.parquet', new Uint8Array(buffer))

    const conn = await db.connect()
    await conn.query(`
      INSTALL parquet;
      LOAD parquet;
      CREATE TABLE rtc_stats AS SELECT *
      FROM read_parquet('rtc_stats.parquet');
    `)

    const scannedElement = document.getElementById('scanned')
    if (scannedElement) {
      scannedElement.textContent = 'Scanned: true'
    }

    const result = await conn.query(`
      SELECT count(*) AS count FROM rtc_stats;
    `)

    const resultElement = document.getElementById('counted')
    if (resultElement) {
      resultElement.textContent = `Count: ${result.toArray()[0].count}`
    }

    // scan-parquetボタンを無効化し、他のボタンを有効化
    if (scanParquetButton) {
      scanParquetButton.disabled = true
    }
    if (samplesButton) {
      samplesButton.disabled = false
    }
    if (aggregationButton) {
      aggregationButton.disabled = false
    }
    if (clearButton) {
      clearButton.disabled = false
    }

    await conn.close()
  })

  document.getElementById('samples')?.addEventListener('click', async () => {
    const conn = await db.connect()
    // 10% のサンプルを取得
    const result = await conn.query(`
      SELECT timestamp, connection_id, rtc_type
      FROM rtc_stats
      USING SAMPLE 1 PERCENT (bernoulli);
    `)

    const resultElement = document.getElementById('result')
    if (resultElement) {
      const table = document.createElement('table')
      const headers = ['timestamp', 'connection_id', 'rtc_type']

      const headerRow = document.createElement('tr')
      headerRow.innerHTML = headers.map((header) => `<th>${header}</th>`).join('')
      table.appendChild(headerRow)

      const rows = result.toArray().map((row) => {
        const parsedRow = JSON.parse(row)
        const tr = document.createElement('tr')
        tr.innerHTML = headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
        return tr
      })

      table.append(...rows)

      resultElement.innerHTML = ''
      resultElement.appendChild(table)
    }

    await conn.close()
  })

  document.getElementById('aggregation')?.addEventListener('click', async () => {
    const conn = await db.connect()
    // SQL は適当ですので、参考にしないで下さい
    const result = await conn.query(`
        SELECT
          time_bucket,
          channel_id,
          session_id,
          connection_id,
          bytes_sent - LAG(bytes_sent) OVER (PARTITION BY channel_id, session_id, connection_id ORDER BY time_bucket) AS bytes_sent_diff,
          bytes_received - LAG(bytes_received) OVER (PARTITION BY channel_id, session_id, connection_id ORDER BY time_bucket) AS bytes_received_diff,
          packets_sent - LAG(packets_sent) OVER (PARTITION BY channel_id, session_id, connection_id ORDER BY time_bucket) AS packets_sent_diff,
          packets_received - LAG(packets_received) OVER (PARTITION BY channel_id, session_id, connection_id ORDER BY time_bucket) AS packets_received_diff
        FROM (
          SELECT
            strftime(time_bucket('15 seconds', strptime(timestamp, '%Y-%m-%dT%H:%M:%S.%fZ')), '%Y-%m-%d %H:%M:%S') AS time_bucket,
            channel_id,
            session_id,
            connection_id,
            MAX(CAST(rtc_data->'$.bytesSent' AS BIGINT)) AS bytes_sent,
            MAX(CAST(rtc_data->'$.bytesReceived' AS BIGINT)) AS bytes_received,
            MAX(CAST(rtc_data->'$.packetsSent' AS BIGINT)) AS packets_sent,
            MAX(CAST(rtc_data->'$.packetsReceived' AS BIGINT)) AS packets_received
          FROM rtc_stats
          WHERE rtc_type = 'transport'
          GROUP BY time_bucket, channel_id, session_id, connection_id
        )
        ORDER BY time_bucket ASC;
    `)

    const resultElement = document.getElementById('result')
    if (resultElement) {
      const table = document.createElement('table')
      const headers = [
        'time_bucket',
        'channel_id',
        'session_id',
        'connection_id',
        'bytes_sent_diff',
        'bytes_received_diff',
        'packets_sent_diff',
        'packets_received_diff',
      ]

      const headerRow = document.createElement('tr')
      headerRow.innerHTML = headers.map((header) => `<th>${header}</th>`).join('')
      table.appendChild(headerRow)

      const rows = result.toArray().map((row) => {
        const parsedRow = JSON.parse(row)
        const tr = document.createElement('tr')
        tr.innerHTML = headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
        return tr
      })

      table.append(...rows)

      resultElement.innerHTML = ''
      resultElement.appendChild(table)
    }
  })

  document.getElementById('clear')?.addEventListener('click', async () => {
    const resultElement = document.getElementById('result')
    if (resultElement) {
      resultElement.innerHTML = ''
    }

    // DuckDBのテーブルを削除
    const conn = await db.connect()
    await conn.query('DROP TABLE IF EXISTS rtc_stats;')
    await conn.close()

    await db.dropFile('rtc_stats.parquet')

    // IndexedDBからファイルを削除
    try {
      await deleteBufferFromIndexedDB()
      console.log('Parquet file deleted from IndexedDB')
    } catch (error) {
      console.error('Error deleting Parquet file from IndexedDB:', error)
    }

    const scannedElement = document.getElementById('scanned')
    if (scannedElement) {
      scannedElement.textContent = 'スキャン済み: false'
    }

    const countedElement = document.getElementById('counted')
    if (countedElement) {
      countedElement.textContent = 'カウント: 0'
    }

    // ボタンの状態を更新
    if (scanParquetButton) {
      scanParquetButton.disabled = false
    }
    if (samplesButton) {
      samplesButton.disabled = true
    }
    if (aggregationButton) {
      aggregationButton.disabled = true
    }
  })
})

// IndexedDB関連の定数と関数

const DB_NAME = 'ParquetCache'
const STORE_NAME = 'files'
const FILE_KEY = 'rtc_stats.parquet'

const getBufferFromIndexedDB = async (): Promise<ArrayBuffer | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      db.createObjectStore(STORE_NAME)
    }

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const getRequest = store.get(FILE_KEY)

      getRequest.onsuccess = () => resolve(getRequest.result)
      getRequest.onerror = () => reject(getRequest.error)
    }

    request.onerror = () => reject(request.error)
  })
}

const saveBufferToIndexedDB = async (buffer: ArrayBuffer): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const putRequest = store.put(buffer, FILE_KEY)

      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    }

    request.onerror = () => reject(request.error)
  })
}

// IndexedDBからファイルを削除する関数を追加
const deleteBufferFromIndexedDB = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const deleteRequest = store.delete(FILE_KEY)

      deleteRequest.onsuccess = () => resolve()
      deleteRequest.onerror = () => reject(deleteRequest.error)
    }

    request.onerror = () => reject(request.error)
  })
}
