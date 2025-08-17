import { sql } from '@codemirror/lang-sql'
import { EditorState } from '@codemirror/state'
import { showPanel } from '@codemirror/view'
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import { vim } from '@replit/codemirror-vim'
import { EditorView, basicSetup } from 'codemirror'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

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

const FILE_NAME = 'rtc_stats.parquet'

function App() {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null)
  const [isVimMode, setIsVimMode] = useState(true)
  const [opfsStatus, setOpfsStatus] = useState(false)
  const [counted, setCounted] = useState(0)
  const [duckdbVersion, setDuckdbVersion] = useState('')
  const [duckdbWasmVersion, setDuckdbWasmVersion] = useState('')
  const [buttonsEnabled, setButtonsEnabled] = useState(false)
  const [fetchButtonEnabled, setFetchButtonEnabled] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [resultHTML, setResultHTML] = useState('')

  const editorRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  const getParquetBuffer = useCallback(async (PARQUET_FILE_URL: string): Promise<ArrayBuffer> => {
    const response = await fetch(PARQUET_FILE_URL)
    return response.arrayBuffer()
  }, [])

  const readParquetFile = useCallback(
    async (db: duckdb.AsyncDuckDB, buffer: ArrayBuffer): Promise<void> => {
      const conn = await db.connect()
      try {
        const tableExists = await conn.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_name = 'rtc_stats'
        ) as exists_flag;
      `)

        const exists = JSON.parse(tableExists.toArray()[0] as unknown as string).exists_flag

        if (!exists) {
          console.log('テーブルが存在しないため作成します')
          await db.registerFileBuffer(`${FILE_NAME}`, new Uint8Array(buffer))
          await conn.query(`
          CREATE TABLE rtc_stats AS SELECT * FROM read_parquet('${FILE_NAME}');
        `)
        } else {
          console.log('テーブルは既に存在します')
        }
        setFetchButtonEnabled(false)
      } catch (error) {
        console.error('テーブル作成中にエラーが発生しました:', error)
        throw error
      } finally {
        console.log('close')
        await db.dropFile(`${FILE_NAME}`)
        await conn.close()
      }
    },
    [],
  )

  const performSearch = useCallback(
    async (db: duckdb.AsyncDuckDB, searchTerm: string): Promise<void> => {
      if (!searchTerm.trim()) {
        setResultHTML('')
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

      const headers = ['timestamp', 'connection_id', 'rtc_type']
      const rows = result.toArray().map((row: unknown) => {
        const parsedRow = JSON.parse(row as string)
        return headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
      })

      const tableHTML = `
      <table>
        <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
        ${rows.map((r: string) => `<tr>${r}</tr>`).join('')}
      </table>
    `
      setResultHTML(tableHTML)

      await conn.close()
    },
    [],
  )

  const initializeDb = useCallback(async () => {
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
    const PARQUET_FILE_URL = import.meta.env['VITE_PARQUET_FILE_URL']

    const worker = new duckdb_worker()
    const logger = new duckdb.ConsoleLogger()
    const newDb = new duckdb.AsyncDuckDB(logger, worker)

    await newDb.instantiate(duckdb_wasm)
    await newDb.open({
      path: 'opfs://duckdb-wasm-parquet.db',
      accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
    })

    setDb(newDb)

    const version = await newDb.getVersion()
    setDuckdbVersion(`DuckDB: ${version}`)
    setDuckdbWasmVersion(`DuckDB-Wasm: ${duckdb.PACKAGE_VERSION}`)

    const conn = await newDb.connect()
    await conn.query(`
      INSTALL parquet;
      LOAD parquet;
      INSTALL json;
      LOAD json;
    `)
    await conn.close()

    const buffer = await getParquetBuffer(PARQUET_FILE_URL)
    await readParquetFile(newDb, buffer)

    setOpfsStatus(true)

    const conn2 = await newDb.connect()
    const result = await conn2.query(`
      SELECT COUNT(*) FROM rtc_stats;
    `)
    const count = JSON.parse(result.toArray()[0] as unknown as string)['count_star()']
    setCounted(count)
    await conn2.close()

    setButtonsEnabled(true)
  }, [getParquetBuffer, readParquetFile])

  const initEditor = useCallback(
    (db: duckdb.AsyncDuckDB) => {
      if (!editorRef.current || editorViewRef.current) return

      const createExtensions = (isVim: boolean) => [
        isVim
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
            editorViewRef.current?.dispatch({
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
          vimToggleButton.addEventListener('click', () => toggleVimMode())

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
              const rows = result.toArray()
              if (rows.length > 0) {
                const headers = Object.keys(JSON.parse(rows[0] as unknown as string))
                const tableHTML = `
                <table>
                  <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
                  ${rows
                    .map((row: unknown) => {
                      const parsedRow = JSON.parse(row as string)
                      return `<tr>${headers.map((h) => `<td>${parsedRow[h]}</td>`).join('')}</tr>`
                    })
                    .join('')}
                </table>
              `
                setResultHTML(tableHTML)
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
      ]

      editorViewRef.current = new EditorView({
        state: EditorState.create({
          doc: DEFAULT_SQL,
          extensions: createExtensions(isVimMode),
        }),
      })

      editorRef.current.appendChild(editorViewRef.current.dom)

      const toggleVimMode = () => {
        setIsVimMode((prev) => !prev)
        const currentSQL = editorViewRef.current?.state.doc.toString() || DEFAULT_SQL
        editorViewRef.current?.setState(
          EditorState.create({
            doc: currentSQL,
            extensions: createExtensions(!isVimMode),
          }),
        )
      }
    },
    [isVimMode],
  )

  useEffect(() => {
    initializeDb()
  }, [initializeDb])

  useEffect(() => {
    if (db && editorRef.current && !editorViewRef.current) {
      initEditor(db)
    }
  }, [db, initEditor])

  useEffect(() => {
    if (db && searchTerm) {
      performSearch(db, searchTerm)
    }
  }, [searchTerm, db, performSearch])

  const handleFetchParquet = async () => {
    await initializeDb()
  }

  const handleSamples = async () => {
    if (!db) return
    const conn = await db.connect()
    const result = await conn.query(`
      SELECT timestamp, connection_id, rtc_type
      FROM rtc_stats
      USING SAMPLE 1 PERCENT (bernoulli);
    `)

    const headers = ['timestamp', 'connection_id', 'rtc_type']
    const rows = result.toArray().map((row: unknown) => {
      const parsedRow = JSON.parse(row as string)
      return headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
    })

    const tableHTML = `
      <table>
        <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
        ${rows.map((r: string) => `<tr>${r}</tr>`).join('')}
      </table>
    `
    setResultHTML(tableHTML)

    await conn.close()
  }

  const handleSamplesDownloadParquet = async () => {
    if (!db) return
    const conn = await db.connect()
    try {
      await conn.query(`
        COPY (SELECT * FROM rtc_stats
        USING SAMPLE 1 PERCENT (bernoulli)) TO samples.parquet (FORMAT 'parquet', COMPRESSION 'zstd');
      `)
      const parquet_buffer = await db.copyFileToBuffer('samples.parquet')
      const blob = new Blob([parquet_buffer as unknown as ArrayBuffer], {
        type: 'application/octet-stream',
      })

      const downloadUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = 'samples.parquet'
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)

      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Parquetファイルのダウンロード中にエラーが発生しました:', error)
    } finally {
      await conn.close()
    }
  }

  const handleAggregation = async () => {
    if (!db) return
    const conn = await db.connect()
    const result = await conn.query(DEFAULT_SQL)

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

    const rows = result.toArray().map((row: unknown) => {
      const parsedRow = JSON.parse(row as string)
      return headers.map((header) => `<td>${parsedRow[header]}</td>`).join('')
    })

    const tableHTML = `
      <table>
        <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
        ${rows.map((r: string) => `<tr>${r}</tr>`).join('')}
      </table>
    `
    setResultHTML(tableHTML)

    await conn.close()
  }

  const handlePurge = async () => {
    if (!db) return
    setResultHTML('')

    await db.terminate()
    const opfsRoot = await navigator.storage.getDirectory()
    await opfsRoot.removeEntry('duckdb-wasm-parquet.db').catch(() => {})
    await opfsRoot.removeEntry('duckdb-wasm-parquet.db.wal').catch(() => {})

    setOpfsStatus(false)
    setCounted(0)
    setFetchButtonEnabled(true)
    setButtonsEnabled(false)
    setDb(null)
  }

  return (
    <div className="container">
      <h1>DuckDB-Wasm (OPFS) + Parquet + S3-compatible object storage</h1>
      <h2>
        GitHub:{' '}
        <a href="https://github.com/voluntas/duckdb-wasm-parquet">
          https://github.com/voluntas/duckdb-wasm-parquet
        </a>
      </h2>
      <h3>{duckdbVersion}</h3>
      <h3>{duckdbWasmVersion}</h3>
      <h3>OPFS: {opfsStatus ? 'true' : 'false'}</h3>
      <h3>Counted: {counted}</h3>
      <div ref={editorRef} />
      <button type="button" onClick={handleFetchParquet} disabled={!fetchButtonEnabled}>
        Fetch Parquet
      </button>
      <button type="button" onClick={handleSamples} disabled={!buttonsEnabled}>
        Samples (1%)
      </button>
      <button type="button" onClick={handleSamplesDownloadParquet} disabled={!buttonsEnabled}>
        Samples (1%) Download Parquet
      </button>
      <button type="button" onClick={handleAggregation} disabled={!buttonsEnabled}>
        Aggregation
      </button>
      <button type="button" onClick={handlePurge} disabled={!buttonsEnabled}>
        Purge
      </button>
      <br />
      <input
        type="text"
        placeholder="インスタント検索..."
        value={searchTerm}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
        disabled={!buttonsEnabled}
        style={{
          width: '50%',
          maxWidth: '500px',
          padding: '10px',
          marginBottom: '10px',
          fontSize: '16px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          display: 'inline-block',
        }}
      />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: テーブル表示のため */}
      <div dangerouslySetInnerHTML={{ __html: resultHTML }} />
    </div>
  )
}

export default App
