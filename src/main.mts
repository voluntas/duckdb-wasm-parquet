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

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
  const worker = new Worker(bundle.mainWorker ?? '')
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  document.getElementById('scan-parquet')?.addEventListener('click', async () => {
    const conn = await db.connect()
    await conn.query(`
      CREATE TABLE rtc_stats AS SELECT *
      FROM read_parquet('${PARQUET_FILE_URL}');
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

    await conn.close()
  })

  document.getElementById('load-table')?.addEventListener('click', async () => {
    const conn = await db.connect()
    const result = await conn.query(`
      SELECT timestamp, connection_id, rtc_type
      FROM rtc_stats LIMIT 100;
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

  document.getElementById('clear')?.addEventListener('click', () => {
    const resultElement = document.getElementById('result')
    if (resultElement) {
      resultElement.innerHTML = ''
    }
  })
})
