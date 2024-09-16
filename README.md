# DuckDB-Wasm + Parquet + S3-compatible object storage + OPFS

![Static Badge](https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 概要

[DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview.html) をブラウザで使用して、
S3 互換オブジェクトストレージにある [Parquet](https://parquet.apache.org/) ファイルを読み込んで [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) に保存し、 OPFS からファイルを読み込んで DuckdB-Wasm に登録し、DuckDB-Wasm で SQL でクエリを実行するお試し用のアプリです。

## 注意

- SQL は適当ですので、参考にしないで下さい

## とりあえず触ってみたい

[GitHub Pages](https://voluntas.github.io/duckdb-wasm-parquet/)

## ローカルで動作させる方法

```sh
pnpm install
mv .env.template .env
# https://duckdb-wasm.shiguredo.jp/P78BHZM3MD3MV47JDZG47PB8PW.parquet を設定する
pnpm run dev
```

- ブラウザで `http://localhost:5173/` にアクセスして、`Scan Parquet` ボタンをクリックしてください
- `Samples (1%)` ボタンをクリックして、サンプリングした 1% のデータを表示してみてください
- `Aggregation` ボタンをクリックして、集計した結果を表示してみてください
- `Clear` ボタンで OPFS のファイルを削除します

## 動作例

[![Image from Gyazo](https://i.gyazo.com/36769409b57c70ad4ca6ce2dbee643b8.gif)](https://gyazo.com/36769409b57c70ad4ca6ce2dbee643b8)

## Parquet ファイルについて

以下の URL でお試し用の [Parquet](https://parquet.apache.org/) ファイルを取得することができます。
<https://duckdb-wasm.shiguredo.jp/P78BHZM3MD3MV47JDZG47PB8PW.parquet>

この Parquet ファイルは[時雨堂](https://shiguredo.jp/)の [WebRTC SFU Sora](https://sora.shiguredo.jp/) が出力する
クライアントから送られてくる [WebRTC 統計情報](https://www.w3.org/TR/webrtc-stats/) を
[Fluent Bit](https://fluentbit.io/) 経由で [S3 互換オブジェクトストレージ](https://www.linode.com/products/object-storage/) へ保存し、
DuckDB で集約し Parquet ファイルとして出力したものです。
元々のログは [JSONL](https://jsonlines.org/) 形式で gzip 圧縮です。

- この Parquet ファイルは [zstd](https://github.com/facebook/zstd) で圧縮されています
- この Parquet ファイルは [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) に保存されており、パブリックで誰でもアクセスすることができます
- この Parquet ファイルの [Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin) は `http://localhost:5173/` からのアクセスを許可しています
- この Parquet ファイルのライセンスは [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) です

## OPFS について

[Origin private file system \- Web APIs \| MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

安全にブラウザでファイルを取り扱う仕組みです。 [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) を利用して S3 互換のオブジェクトストレージから Parquet ファイルを取得し、OPFS に保存しています。
保存したファイルを DuckDB へ登録し、アクセスできるようにします。

この仕組みを使う事で解析用のファイルを再度ダウンロードする必要がなくなります。

### Safari

Safari の OPFS は [FileSystemFileHandle: createWritable\(\) method](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable) が実装されていないため、Safari では OPFS は利用せず毎回 fetch するようにしています。

[231706 – Implement File System standard](https://bugs.webkit.org/show_bug.cgi?id=231706)

### DuckDB でアクセスしてみる

```sql
D SELECT * FROM parquet_scan('https://duckdb-wasm.shiguredo.jp/P78BHZM3MD3MV47JDZG47PB8PW.parquet';
┌──────────────────────┬──────────────────────┬─────────────────┬───┬───────────────────┬─────────────────────┐
│    connection_id     │          id          │      label      │ … │   rtc_timestamp   │      rtc_type       │
│       varchar        │       varchar        │     varchar     │   │      double       │       varchar       │
├──────────────────────┼──────────────────────┼─────────────────┼───┼───────────────────┼─────────────────────┤
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ media-playout       │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ certificate         │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ certificate         │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ codec               │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ codec               │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ candidate-pair      │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ candidate-pair      │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ candidate-pair      │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ candidate-pair      │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ candidate-pair      │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ candidate-pair      │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ data-channel        │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ data-channel        │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ data-channel        │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ data-channel        │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ local-candidate     │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ local-candidate     │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ local-candidate     │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ local-candidate     │
│ F6WJ4SY2HD63Z25XD3…  │ DE5MC2JG3H2PK667ZG…  │ WebRTC SFU Sora │ … │ 1726394702721.481 │ local-candidate     │
│          ·           │          ·           │        ·        │ · │         ·         │       ·             │
│          ·           │          ·           │        ·        │ · │         ·         │       ·             │
│          ·           │          ·           │        ·        │ · │         ·         │       ·             │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ candidate-pair      │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ data-channel        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ data-channel        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ data-channel        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ data-channel        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ inbound-rtp         │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ inbound-rtp         │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ inbound-rtp         │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ inbound-rtp         │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ outbound-rtp        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ outbound-rtp        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │   1726403011612.0 │ remote-inbound-rtp  │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │   1726403014647.0 │ remote-inbound-rtp  │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │   1726403013580.0 │ remote-outbound-rtp │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │   1726403011612.0 │ remote-outbound-rtp │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │   1726403015068.0 │ remote-outbound-rtp │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │   1726403014750.0 │ remote-outbound-rtp │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ media-source        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ media-source        │
│ ZVWETDA641527D2A6T…  │ S31C88V2SX7M76DD6M…  │ WebRTC SFU Sora │ … │ 1726403015487.149 │ transport           │
├──────────────────────┴──────────────────────┴─────────────────┴───┴───────────────────┴─────────────────────┤
│ 83911 rows (40 shown)                                                                  20 columns (5 shown) │
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
