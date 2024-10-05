import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'

document.addEventListener('DOMContentLoaded', async () => {
  const PARQUET_FILE_URL = import.meta.env.VITE_PARQUET_FILE_URL
  const scanParquetButton = document.getElementById('scan-parquet') as HTMLButtonElement | null
  const samplesButton = document.getElementById('samples') as HTMLButtonElement | null
  const aggregationButton = document.getElementById('aggregation') as HTMLButtonElement | null
  const clearButton = document.getElementById('clear') as HTMLButtonElement | null
  const searchInput = document.getElementById('search') as HTMLInputElement | null

  // すべてのボタンを初期状態で無効化
  for (const button of [
    scanParquetButton,
    samplesButton,
    aggregationButton,
    clearButton,
    searchInput,
  ]) {
    if (button) button.disabled = true
  }

  if (searchInput) {
    searchInput.addEventListener('input', async () => {
      await performSearch(db, searchInput.value)
    })
  }

  const worker = new duckdb_worker()
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)

  await db.instantiate(duckdb_wasm)

  const duckdbVersionElement = document.getElementById('duckdb-version')
  if (duckdbVersionElement) {
    const version = await db.getVersion()
    duckdbVersionElement.textContent = `DuckDB: ${version}`
  }

  const duckdbWasmVersionElement = document.getElementById('duckdb-wasm-version')
  if (duckdbWasmVersionElement) {
    const version = duckdb.PACKAGE_VERSION
    duckdbWasmVersionElement.textContent = `DuckDB-Wasm: ${version}`
  }

  const conn = await db.connect()
  await conn.query(`
    INSTALL parquet;
    LOAD parquet;
    INSTALL json;
    LOAD json;
  `)
  await conn.close()

  // ここで OPFS にあるかどうかをチェックしてあったらすぐに反映するようにする
  const buffer = await getBufferFromOPFS()
  if (buffer) {
    await loadParquetFile(db, buffer)
    await updateStatus(db)

    // ここは OPFS から読み込んだので、OPFS が使われていることを示す
    const opfsStatusElement = document.getElementById('opfsStatus')
    if (opfsStatusElement) {
      opfsStatusElement.textContent = 'OPFS: true'
    }

    // scan-parquet ボタンを無効化し、他のボタンを有効化
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
    if (searchInput) {
      searchInput.disabled = false
    }
  }

  // DuckDB の初期化が完了して、OPFS にファイルが無い場合はボタンを有効化
  if (scanParquetButton && !buffer) {
    scanParquetButton.disabled = false
  }

  document.getElementById('scan-parquet')?.addEventListener('click', async () => {
    const buffer = await getParquetBuffer(PARQUET_FILE_URL)

    await loadParquetFile(db, buffer)
    await updateStatus(db)

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
    if (searchInput) {
      searchInput.disabled = false
    }

    await conn.close()
  })

  document.getElementById('samples')?.addEventListener('click', async () => {
    const conn = await db.connect()
    // 10% のサ��プルを取得
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

    // DuckDB からテーブルを削除
    const conn = await db.connect()
    await conn.query('DROP TABLE IF EXISTS rtc_stats;')
    await conn.close()

    // DuckDB からファイルを削除
    await db.dropFile('rtc_stats.parquet')

    // OPFS から���ァイルを削除
    if ('createWritable' in FileSystemFileHandle.prototype) {
      try {
        await deleteBufferFromOPFS()
        console.log('Parquet file deleted from OPFS')
      } catch (error) {
        console.error('Error deleting Parquet file from OPFS:', error)
      }
    }

    const opfsStatusElement = document.getElementById('opfsStatus')
    if (opfsStatusElement) {
      opfsStatusElement.textContent = 'OPFS: false'
    }

    const scannedElement = document.getElementById('scanned')
    if (scannedElement) {
      scannedElement.textContent = 'Scanned: false'
    }

    const countedElement = document.getElementById('counted')
    if (countedElement) {
      countedElement.textContent = 'Counted: 0'
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
    if (clearButton) {
      clearButton.disabled = true
    }
    if (searchInput) {
      searchInput.disabled = true
    }
  })
})

// 検索を実行する関数
const performSearch = async (db: duckdb.AsyncDuckDB, searchTerm: string): Promise<void> => {
  const resultElement = document.getElementById('result')
  if (!resultElement) return

  // 検索語が空の場合、結果をクリアして終了
  if (!searchTerm.trim()) {
    resultElement.innerHTML = ''
    return
  }

  const conn = await db.connect()
  const result = await conn.query(`
    SELECT timestamp, connection_id, rtc_type
    FROM rtc_stats
    WHERE connection_id LIKE '%${searchTerm}%'
       OR channel_id LIKE '%${searchTerm}%'
       OR timestamp LIKE '%${searchTerm}%'
       OR rtc_type LIKE '%${searchTerm}%'
    USING SAMPLE 1 PERCENT (bernoulli);
  `)

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

  await conn.close()
}

// OPFS関連の関数

const FILE_NAME = 'rtc_stats.parquet'

const loadParquetFile = async (db: duckdb.AsyncDuckDB, buffer: ArrayBuffer): Promise<void> => {
  await db.registerFileBuffer(`${FILE_NAME}`, new Uint8Array(buffer))
  const conn = await db.connect()
  await conn.query(`
    INSTALL parquet;
    LOAD parquet;
    CREATE TABLE rtc_stats AS SELECT *
    FROM read_parquet('${FILE_NAME}');
  `)
  await conn.close()
}

const updateStatus = async (db: duckdb.AsyncDuckDB): Promise<void> => {
  const conn = await db.connect()
  const result = await conn.query(`
    SELECT count(*) AS count FROM rtc_stats;
  `)
  const scannedResultElement = document.getElementById('scanned')
  if (scannedResultElement) {
    scannedResultElement.textContent = 'Scanned: true'
  }
  const countedResultElement = document.getElementById('counted')
  if (countedResultElement) {
    countedResultElement.textContent = `Counted: ${result.toArray()[0].count}`
  }
  await conn.close()
}

const getBufferFromOPFS = async (): Promise<ArrayBuffer | null> => {
  if ('createWritable' in FileSystemFileHandle.prototype) {
    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(FILE_NAME)
      const file = await fileHandle.getFile()
      return await file.arrayBuffer()
    } catch (error) {
      console.error('Error reading file from OPFS:', error)
      return null
    }
  } else {
    console.warn('createWritable is not supported. Data will not be saved to OPFS.')
    return null
  }
}

const saveStreamToOPFS = async (stream: ReadableStream): Promise<void> => {
  if ('createWritable' in FileSystemFileHandle.prototype) {
    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(FILE_NAME, { create: true })
      const writable = await fileHandle.createWritable()
      await stream.pipeTo(writable)

      const opfsStatusElement = document.getElementById('opfsStatus')
      if (opfsStatusElement) {
        opfsStatusElement.textContent = 'OPFS: true'
      }
    } catch (error) {
      console.error('Error occurred while saving file to OPFS:', error)
      throw error
    }
  } else {
    console.warn('createWritable is not supported. Data will not be saved to OPFS.')
  }
}

const deleteBufferFromOPFS = async (): Promise<void> => {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(FILE_NAME)
  } catch (error) {
    console.error('Error deleting file from OPFS:', error)
    throw error
  }
}

const getParquetBuffer = async (PARQUET_FILE_URL: string): Promise<ArrayBuffer> => {
  if (!('createWritable' in FileSystemFileHandle.prototype)) {
    const response = await fetch(PARQUET_FILE_URL)
    const buffer = await response.arrayBuffer()
    return buffer
  }

  let buffer = await getBufferFromOPFS()
  if (buffer) {
    // ここは OPFS から読み込んだので、OPFS が使われていることを示す
    const opfsStatusElement = document.getElementById('opfsStatus')
    if (opfsStatusElement) {
      opfsStatusElement.textContent = 'OPFS: true'
    }
    return buffer
  }

  const response = await fetch(PARQUET_FILE_URL)
  if (!response.body) {
    throw new Error('Failed to fetch parquet file.')
  }
  await saveStreamToOPFS(response.body)
  buffer = await getBufferFromOPFS()
  if (!buffer) {
    throw new Error('Failed to retrieve buffer from OPFS.')
  }
  return buffer
}
