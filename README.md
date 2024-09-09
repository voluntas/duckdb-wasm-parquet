# DuckDB-Wasm + Parquet + S3-compatible object storage

![Static Badge](https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 概要

[DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview.html) をブラウザで使用して、
Parquet ファイルを読み込んで SQL でクエリを実行するお試し用のアプリです。

## 注意

- SQL は適当ですので、参考にしないで下さい

## 動作方法

```sh
pnpm install
mv .env.template .env
# https://duckdb-wasm.shiguredo.jp/ES6VB3580N3R7EGKGT0R9NKWPR.parquet を設定する
pnpm run dev
```

- ブラウザで `http://localhost:5173/` にアクセスして、`Scan Parquet` ボタンをクリックしてください
- `Samples (1%)` ボタンをクリックして、サンプリングした 1% のデータを表示してみてください
- `Aggregation` ボタンをクリックして、集計した結果を表示してみてください

## 動作例

[![Image from Gyazo](https://i.gyazo.com/5dadf7e6bc002cb77d7d194e46fa5e3d.gif)](https://gyazo.com/5dadf7e6bc002cb77d7d194e46fa5e3d)

## Parquet ファイルについて

以下の URL でお試し用の [Parquet](https://parquet.apache.org/) ファイルを取得することができます。
<https://duckdb-wasm.shiguredo.jp/ES6VB3580N3R7EGKGT0R9NKWPR.parquet>

この Parquet ファイルは[時雨堂](https://shiguredo.jp/)の [WebRTC SFU Sora](https://sora.shiguredo.jp/) が出力する
クライアントから送られてくる [WebRTC 統計情報](https://www.w3.org/TR/webrtc-stats/) を
[Fluent Bit](https://fluentbit.io/) 経由で [S3 互換オブジェクトストレージ](https://www.linode.com/products/object-storage/) へ保存し、
DuckDB で集約し Parquet ファイルとして出力したものです。
元々のログは [JSONL](https://jsonlines.org/) 形式で gzip 圧縮です。

- この Parquet ファイルは [zstd](https://github.com/facebook/zstd) で圧縮されています
- この Parquet ファイルは [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) に保存されており、パブリックで誰でもアクセスすることができます
- この Parquet ファイルの [Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin) は `http://localhost:5173/` からのアクセスのみを許可しています
- この Parquet ファイルのライセンスは [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) です

### DuckDB でアクセスしてみる

```sql
D SELECT * FROM parquet_scan('https://duckdb-wasm.shiguredo.jp/ES6VB3580N3R7EGKGT0R9NKWPR.parquet');
┌──────────────────────┬──────────────────────┬─────────────────┬───┬───────────────────┬─────────────────────┐
│    connection_id     │          id          │      label      │ … │   rtc_timestamp   │      rtc_type       │
│       varchar        │       varchar        │     varchar     │   │      double       │       varchar       │
├──────────────────────┼──────────────────────┼─────────────────┼───┼───────────────────┼─────────────────────┤
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ media-playout       │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ candidate-pair      │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ candidate-pair      │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ outbound-rtp        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ outbound-rtp        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │   1725110873532.0 │ remote-inbound-rtp  │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │   1725110877738.0 │ remote-inbound-rtp  │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ media-source        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ media-source        │
│ JYCQZ5HC3938558D2N…  │ D4WM4JQMJ17CHA8XXK…  │ WebRTC SFU Sora │ … │ 1725110878505.041 │ transport           │
│ JYCQZ5HC3938558D2N…  │ GGJREB7S6D6XXDYS1Y…  │ WebRTC SFU Sora │ … │ 1725110893504.201 │ media-playout       │
│ JYCQZ5HC3938558D2N…  │ GGJREB7S6D6XXDYS1Y…  │ WebRTC SFU Sora │ … │ 1725110893504.201 │ candidate-pair      │
│ JYCQZ5HC3938558D2N…  │ GGJREB7S6D6XXDYS1Y…  │ WebRTC SFU Sora │ … │ 1725110893504.201 │ candidate-pair      │
│ JYCQZ5HC3938558D2N…  │ GGJREB7S6D6XXDYS1Y…  │ WebRTC SFU Sora │ … │ 1725110893504.201 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ GGJREB7S6D6XXDYS1Y…  │ WebRTC SFU Sora │ … │ 1725110893504.201 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ GGJREB7S6D6XXDYS1Y…  │ WebRTC SFU Sora │ … │ 1725110893504.201 │ data-channel        │
│          ·           │          ·           │        ·        │ · │         ·         │      ·              │
│          ·           │          ·           │        ·        │ · │         ·         │      ·              │
│          ·           │          ·           │        ·        │ · │         ·         │      ·              │
│ SV5WZSYWFN5HH2TQFG…  │ PJC908KTKX0NS9K81F…  │ WebRTC SFU Sora │ … │ 1725121716070.904 │ media-source        │
│ SV5WZSYWFN5HH2TQFG…  │ PJC908KTKX0NS9K81F…  │ WebRTC SFU Sora │ … │ 1725121716070.904 │ transport           │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ media-playout       │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ candidate-pair      │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ candidate-pair      │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ data-channel        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ inbound-rtp         │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ inbound-rtp         │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ outbound-rtp        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ outbound-rtp        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │   1725121721329.0 │ remote-inbound-rtp  │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │   1725121723603.0 │ remote-inbound-rtp  │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │   1725121721445.0 │ remote-outbound-rtp │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │   1725121724271.0 │ remote-outbound-rtp │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ media-source        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ media-source        │
│ JYCQZ5HC3938558D2N…  │ MCJ3JZNT4N5YN84HNR…  │ WebRTC SFU Sora │ … │ 1725121724397.442 │ transport           │
├──────────────────────┴──────────────────────┴─────────────────┴───┴───────────────────┴─────────────────────┤
│ 15329 rows (40 shown)                                                                  20 columns (5 shown) │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## ライセンス

```text
Copyright 2024-2024, @voluntas

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
