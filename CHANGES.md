# CHANGES

- [ADD] Parquet ファイルを S3-compatible object storage から読み込む仕組みを追加
- [ADD] 読み込んだ Parquet ファイルをテーブルにする仕組みを追加
- [ADD] 読み込んだ Parquet ファイルを表示する仕組みを追加
- [ADD] 読み込んだ Parquet ファイルを利用して集計する仕組みを追加
- [ADD] DuckDB WASM を `next` で追加
  - 通常だと古いバージョンがインストールされるので最新を利用するようにする
