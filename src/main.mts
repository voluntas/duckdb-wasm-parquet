import { sql } from '@codemirror/lang-sql'
import { EditorState } from '@codemirror/state'
import { panels, showPanel } from '@codemirror/view'
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import { vim } from '@replit/codemirror-vim'
import { EditorView, basicSetup } from 'codemirror'

let isVimMode = true
let editor: EditorView

document.addEventListener('DOMContentLoaded', async () => {
  const PARQUET_FILE_URL = import.meta.env.VITE_PARQUET_FILE_URL
  const fetchParquetElement = document.querySelector<HTMLButtonElement>('#fetch-parquet')
  const samplesButton = document.querySelector<HTMLButtonElement>('#samples')
  const samplesDownloadParquetButton = document.querySelector<HTMLButtonElement>(
    '#samples-download-parquet',
  )
  const aggregationButton = document.querySelector<HTMLButtonElement>('#aggregation')
  const purgeButton = document.querySelector<HTMLButtonElement>('#purge')
  const searchInput = document.querySelector<HTMLInputElement>('#search')

  // ボタンを無効化
  if (fetchParquetElement) {
    fetchParquetElement.disabled = true
  }
  if (samplesButton) {
    samplesButton.disabled = true
  }
  if (aggregationButton) {
    aggregationButton.disabled = true
  }
  if (samplesDownloadParquetButton) {
    samplesDownloadParquetButton.disabled = true
  }
  if (purgeButton) {
    purgeButton.disabled = true
  }
  if (searchInput) {
    searchInput.disabled = true
  }

  const DEFAULT_SQL = `SELECT
    time_bucket,
    channel_id,
    session_id,
    connection_id,
    bytes_sent_diff,
    bytes_received_diff,
    packets_sent_diff,
    packets_received_diff
  FROM (
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
  ) 
  WHERE 
    bytes_sent_diff IS NOT NULL AND
    bytes_received_diff IS NOT NULL AND
    packets_sent_diff IS NOT NULL AND
    packets_received_diff IS NOT NULL
  ORDER BY time_bucket ASC;`

  editor = new EditorView({
    state: EditorState.create({
      doc: DEFAULT_SQL,
      extensions: [
        isVimMode
          ? vim({
              status: true,
            })
          : [],
        sql(),
        basicSetup,
        EditorState.readOnly.of(false),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            update.state.doc.toString() === '' &&
            update.transactions.every((tr) => !tr.isUserEvent('input') && !tr.isUserEvent('delete'))
          ) {
            editor.dispatch({
              changes: {
                from: 0,
                to: 0,
                insert: DEFAULT_SQL,
              },
            })
          }
        }),
        showPanel.of((view) => {
          const dom = document.createElement('div')
          dom.style.cssText = `
            padding: 4px;
            display: flex;
            justify-content: flex-end;
            background: #f5f5f5;
            gap: 8px;
          `

          // Vim mode トグルボタン
          const vimToggleButton = document.createElement('button')
          vimToggleButton.textContent = isVimMode ? 'Normal Mode' : 'Vim Mode'
          vimToggleButton.style.cssText = `
            padding: 5px 10px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          `
          vimToggleButton.addEventListener('click', () => toggleVimMode(db))

          // 実行ボタン
          const runButton = document.createElement('button')
          runButton.textContent = 'Run Query'
          runButton.style.cssText = `
            padding: 5px 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          `
          runButton.addEventListener('click', async () => {
            const query = view.state.doc.toString()
            const conn = await db.connect()
            try {
              const result = await conn.query(query)
              const resultElement = document.getElementById('result')
              if (resultElement) {
                const table = document.createElement('table')
                const rows = result.toArray()
                if (rows.length > 0) {
                  const headers = Object.keys(JSON.parse(rows[0]))

                  const headerRow = document.createElement('tr')
                  headerRow.innerHTML = headers.map((header) => `<th>${header}</th>`).join('')
                  table.appendChild(headerRow)

                  for (const row of rows) {
                    const parsedRow = JSON.parse(row)
                    const tr = document.createElement('tr')
                    tr.innerHTML = headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
                    table.appendChild(tr)
                  }

                  resultElement.innerHTML = ''
                  resultElement.appendChild(table)
                }
              }
            } catch (error) {
              console.error('Query execution error:', error)
            } finally {
              await conn.close()
            }
          })

          dom.appendChild(vimToggleButton)
          dom.appendChild(runButton)
          return { dom, bottom: true }
        }),
        EditorView.theme({
          '&': {
            height: '400px',
            maxWidth: '800px',
            position: 'relative',
            marginBottom: '20px',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
        }),
      ],
    }),
  })

  const editorElement = document.getElementById('editor')
  if (editorElement) {
    editorElement.appendChild(editor.dom)
  }

  // すべてのボタンを初期状態で無効化
  for (const button of [
    samplesButton,
    samplesDownloadParquetButton,
    aggregationButton,
    purgeButton,
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
  await db.open({
    path: 'opfs://duckdb-wasm-parquet.db',
    accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
  })

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

  const buffer = await getParquetBuffer(PARQUET_FILE_URL)
  await readParquetFile(db, buffer)

  const opfsStatusElement = document.getElementById('opfsStatus')
  if (opfsStatusElement) {
    opfsStatusElement.textContent = 'OPFS: true'
  }

  const countedElement = document.getElementById('counted')
  if (countedElement) {
    const conn = await db.connect()
    const result = await conn.query(`
      SELECT COUNT(*) FROM rtc_stats;
    `)
    const count = JSON.parse(result.toArray()[0])['count_star()']
    countedElement.textContent = `Counted: ${count}`
    await conn.close()
  }

  if (samplesButton) {
    samplesButton.disabled = false
  }
  if (aggregationButton) {
    aggregationButton.disabled = false
  }
  if (samplesDownloadParquetButton) {
    samplesDownloadParquetButton.disabled = false
  }
  if (purgeButton) {
    purgeButton.disabled = false
  }
  if (searchInput) {
    searchInput.disabled = false
  }

  document.getElementById('fetch-parquet')?.addEventListener('click', async () => {
    const worker = new duckdb_worker()
    const logger = new duckdb.ConsoleLogger()
    const db = new duckdb.AsyncDuckDB(logger, worker)

    await db.instantiate(duckdb_wasm)

    await db.open({
      path: 'opfs://duckdb-wasm-parquet.db',
      accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
    })

    const opfsStatusElement = document.getElementById('opfsStatus')
    if (opfsStatusElement) {
      opfsStatusElement.textContent = 'OPFS: true'
    }

    const buffer = await getParquetBuffer(PARQUET_FILE_URL)
    console.log(buffer)
    await readParquetFile(db, buffer)

    const countedElement = document.getElementById('counted')
    if (countedElement) {
      const conn = await db.connect()
      const result = await conn.query(`
        SELECT COUNT(*) FROM rtc_stats;
      `)
      const count = JSON.parse(result.toArray()[0])['count_star()']
      countedElement.textContent = `Counted: ${count}`
      await conn.close()
    }

    const fetchParquetElement = document.querySelector<HTMLButtonElement>('#fetch-parquet')
    if (fetchParquetElement) {
      fetchParquetElement.disabled = true
    }

    if (samplesButton) {
      samplesButton.disabled = false
    }
    if (samplesDownloadParquetButton) {
      samplesDownloadParquetButton.disabled = false
    }
    if (aggregationButton) {
      aggregationButton.disabled = false
    }
    if (purgeButton) {
      purgeButton.disabled = false
    }
    if (searchInput) {
      searchInput.disabled = false
    }
  })

  document.getElementById('samples')?.addEventListener('click', async () => {
    const conn = await db.connect()
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

  document.getElementById('samples-download-parquet')?.addEventListener('click', async () => {
    const conn = await db.connect()
    try {
      await conn.query(`
        COPY (SELECT * FROM rtc_stats
        USING SAMPLE 1 PERCENT (bernoulli)) TO samples.parquet (FORMAT 'parquet', COMPRESSION 'zstd');
      `)
      const parquet_buffer = await db.copyFileToBuffer('samples.parquet')
      const blob = new Blob([parquet_buffer], { type: 'application/octet-stream' })

      // ダウンロードを自動的に開始
      const downloadUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = 'samples.parquet'
      document.body.appendChild(downloadLink)
      downloadLink.click() // プログラムによる自動クリック
      document.body.removeChild(downloadLink)

      // 使用後にURLを解放
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Parquetファイルのダウンロード中にエラーが発生しました:', error)
    } finally {
      await conn.close()
    }
  })

  document.getElementById('aggregation')?.addEventListener('click', async () => {
    const conn = await db.connect()
    // SQL は適当ですので参考にしないで下さい
    const result = await conn.query(DEFAULT_SQL)

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

  document.getElementById('purge')?.addEventListener('click', async () => {
    const resultElement = document.getElementById('result')
    if (resultElement) {
      resultElement.innerHTML = ''
    }

    await db.terminate()
    const opfsRoot = await navigator.storage.getDirectory()
    await opfsRoot.removeEntry('duckdb-wasm-parquet.db').catch(() => {})
    await opfsRoot.removeEntry('duckdb-wasm-parquet.db.wal').catch(() => {})

    const opfsStatusElement = document.getElementById('opfsStatus')
    if (opfsStatusElement) {
      opfsStatusElement.textContent = 'OPFS: false'
    }

    const countedElement = document.getElementById('counted')
    if (countedElement) {
      countedElement.textContent = 'Counted: 0'
    }

    if (fetchParquetElement) {
      fetchParquetElement.disabled = false
    }

    // ボタンの状態を更新
    if (samplesButton) {
      samplesButton.disabled = true
    }
    if (aggregationButton) {
      aggregationButton.disabled = true
    }
    if (samplesDownloadParquetButton) {
      samplesDownloadParquetButton.disabled = true
    }
    if (purgeButton) {
      purgeButton.disabled = true
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

  // 検索語が空の場合、結果クリアして終了
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

const FILE_NAME = 'rtc_stats.parquet'

const readParquetFile = async (db: duckdb.AsyncDuckDB, buffer: ArrayBuffer): Promise<void> => {
  await db.registerFileBuffer(`${FILE_NAME}`, new Uint8Array(buffer))
  const conn = await db.connect()
  try {
    // テーブルの存在確認をより安全な方法で実装
    const tableExists = await conn.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'rtc_stats'
      ) as exists_flag;
    `)

    const exists = tableExists.toArray()[0].exists_flag

    if (!exists) {
      console.log('テーブルが存在しないため作成します')
      await conn.query(`
        CREATE TABLE rtc_stats AS SELECT * FROM read_parquet('${FILE_NAME}');
      `)
    } else {
      console.log('テーブルは既に存在します')
    }
    const readParquetElement = document.querySelector<HTMLButtonElement>('#fetch-parquet')
    if (readParquetElement) {
      readParquetElement.disabled = true
    }
  } catch (error) {
    console.error('テーブル作成中にエラーが発生しました:', error)
    throw error
  } finally {
    console.log('close')
    await conn.close()
  }
}

const getParquetBuffer = async (PARQUET_FILE_URL: string): Promise<ArrayBuffer> => {
  const response = await fetch(PARQUET_FILE_URL)
  return response.arrayBuffer()
}

// トグルボタンを追加
const toggleVimMode = (db: duckdb.AsyncDuckDB) => {
  isVimMode = !isVimMode

  // エディタの状態を再構築
  const currentSQL = editor.state.doc.toString()
  editor.setState(
    EditorState.create({
      doc: currentSQL,
      extensions: [
        isVimMode
          ? vim({
              status: true,
            })
          : [],
        sql(),
        basicSetup,
        EditorState.readOnly.of(false),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            update.state.doc.toString() === '' &&
            update.transactions.every((tr) => !tr.isUserEvent('input') && !tr.isUserEvent('delete'))
          ) {
            editor.dispatch({
              changes: {
                from: 0,
                to: 0,
                insert: currentSQL,
              },
            })
          }
        }),
        showPanel.of((view) => {
          const dom = document.createElement('div')
          dom.style.cssText = `
          padding: 4px;
          display: flex;
          justify-content: flex-end;
          background: #f5f5f5;
          gap: 8px;
        `

          // Vim mode トグルボタン
          const vimToggleButton = document.createElement('button')
          vimToggleButton.textContent = isVimMode ? 'Normal Mode' : 'Vim Mode'
          vimToggleButton.style.cssText = `
          padding: 5px 10px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        `
          vimToggleButton.addEventListener('click', () => toggleVimMode(db))

          // 実行ボタン
          const runButton = document.createElement('button')
          runButton.textContent = 'Run Query'
          runButton.style.cssText = `
          padding: 5px 10px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        `
          runButton.addEventListener('click', async () => {
            const query = view.state.doc.toString()
            const conn = await db.connect()
            try {
              const result = await conn.query(query)
              const resultElement = document.getElementById('result')
              if (resultElement) {
                const table = document.createElement('table')
                const rows = result.toArray()
                if (rows.length > 0) {
                  const headers = Object.keys(JSON.parse(rows[0]))

                  const headerRow = document.createElement('tr')
                  headerRow.innerHTML = headers.map((header) => `<th>${header}</th>`).join('')
                  table.appendChild(headerRow)

                  for (const row of rows) {
                    const parsedRow = JSON.parse(row)
                    const tr = document.createElement('tr')
                    tr.innerHTML = headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
                    table.appendChild(tr)
                  }

                  resultElement.innerHTML = ''
                  resultElement.appendChild(table)
                }
              }
            } catch (error) {
              console.error('Query execution error:', error)
            } finally {
              await conn.close()
            }
          })

          dom.appendChild(vimToggleButton)
          dom.appendChild(runButton)
          return { dom, bottom: true }
        }),
        EditorView.theme({
          '&': {
            height: '400px',
            maxWidth: '800px',
            position: 'relative',
            marginBottom: '20px',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
        }),
      ],
    }),
  )
}
