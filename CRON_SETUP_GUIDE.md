# 無料Cronジョブ実装ガイド - 完全版 (GitHub Actions計算方式)

このドキュメントでは、Vercel Freeプランの**10秒タイムアウト制限**を回避し、GitHub Actionsの計算リソースを使用してランキングデータを定期更新する方法を説明します。

## 📋 目次

1. [概要](#概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [必要なファイル](#必要なファイル)
4. [セットアップ手順](#セットアップ手順)
5. [動作確認](#動作確認)
6. [トラブルシューティング](#トラブルシューティング)

---

## 概要

### 課題
- **Vercel Freeプランの制限**: Serverless Functionsは**10秒**でタイムアウトします。外部APIを大量に叩くランキング計算は10秒で終わらない可能性が高いです。
- **Cron Jobsの制限**: Vercel Cronは月2回しか実行できません。

### 解決策
- **GitHub Actionsで計算**: 時間制限の緩い（最大6時間）GitHub Actions上で計算スクリプトを実行します。
- **Vercelへデータ送信**: 計算済みの結果データだけをVercel APIに送信し、保存します。

### メリット
- ✅ **タイムアウト回避**: 重い計算処理も完了まで実行可能
- ✅ **完全無料**: GitHub Actionsの無料枠（月2,000分）を使用
- ✅ **サーバー負荷軽減**: Vercel側の負荷はデータの受け取りと保存のみ

---

## アーキテクチャ

```
┌─────────────────────────────┐
│      GitHub Actions         │
│ (Runner: ubuntu-latest)     │
├─────────────────────────────┤
│ 1. スクリプト実行           │
│ 2. Universalis APIから取得  │
│ 3. ランキング計算           │
│ 4. 結果をJSON化             │
└──────────────┬──────────────┘
               │ HTTP POST (計算済みデータ)
               │ Authorization: Bearer <SECRET>
               ↓
┌─────────────────────────────┐
│      Vercel (Next.js)       │
│   /api/sync-ranking         │
├─────────────────────────────┤
│ 1. 認証チェック             │
│ 2. データを受け取る         │
│ 3. DBに保存 (高速)          │
└─────────────────────────────┘
```

---

## 必要なファイル

### 1. `scripts/update-ranking.ts`

**役割**: GitHub Actions上で実行される計算スクリプトです。

```typescript
// scripts/update-ranking.ts
import {
    fetchMarketableIds,
    fetchAllHistories,
    filterRecentEntries
} from '../src/lib/universalis'; // 相対パスでインポート
import { loadRetainerItems, loadItemNames } from '../src/lib/dataLoader';
import type { RankingItem } from '../src/types';

// 環境変数
const VERCEL_APP_URL = process.env.VERCEL_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!VERCEL_APP_URL || !CRON_SECRET) {
    console.error('Missing environment variables');
    process.exit(1);
}

async function main() {
    console.log('Starting ranking calculation...');

    try {
        // 1. データ取得・計算（重い処理）
        const days = 5;
        const minSalesPerDay = 10;
        const worldId = 48;
        const maxItems = 100000; // 処理アイテム数

        const [retainerMap, itemNames, marketableIds] = await Promise.all([
            loadRetainerItems(),
            loadItemNames(),
            fetchMarketableIds()
        ]);

        const targetIds = marketableIds.slice(0, maxItems);
        // バッチ処理などでAPI制限を考慮しつつ取得
        const histories = await fetchAllHistories(targetIds, worldId, 100);

        const results: RankingItem[] = [];
        const minTotalSales = minSalesPerDay * days;

        for (const [itemIdStr, data] of Object.entries(histories)) {
            const itemId = parseInt(itemIdStr);
            const entries = data.entries || [];
            const recentEntries = filterRecentEntries(entries, days);
            const totalQty = recentEntries.reduce((sum, e) => sum + e.quantity, 0);

            if (totalQty < minTotalSales) continue;

            const totalSales = recentEntries.reduce(
                (sum, e) => sum + e.quantity * e.pricePerUnit,
                0
            );
            const avgPrice = totalQty > 0 ? totalSales / totalQty : 0;
            const retainerQty = retainerMap[itemId] || 0;
            const itemName = itemNames[itemIdStr]?.ja || `ID:${itemId}`;
            const qtyForCalc = (retainerQty > 0) ? retainerQty : 1;
            const estimatedValue = Math.round(avgPrice * qtyForCalc);

            results.push({
                item_id: itemId,
                item_name: itemName,
                retainer_qty: retainerQty,
                avg_price: Math.round(avgPrice),
                estimated_value: estimatedValue,
                total_sales_qty: totalQty
            });
        }

        console.log(`Calculation completed. ${results.length} items found.`);

        // 2. 計算結果をVercelに送信
        console.log('Sending data to Vercel...');
        const response = await fetch(`${VERCEL_APP_URL}/api/sync-ranking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CRON_SECRET}`
            },
            body: JSON.stringify({ data: results })
        });

        if (!response.ok) {
            throw new Error(`Failed to sync: ${response.status} ${await response.text()}`);
        }

        const json = await response.json();
        console.log('Sync success:', json);

    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

main();
```

### 2. `src/app/api/sync-ranking/route.ts`

**役割**: 計算済みのデータを受け取り、保存するAPIエンドポイントです。

```typescript
// src/app/api/sync-ranking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type { RankingItem } from '@/types';

// Vercel Postgresなどを使う場合はインポート
// import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    try {
        // 1. 認証
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        
        if (token !== CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. データ受信
        const body = await request.json();
        const data: RankingItem[] = body.data;

        if (!Array.isArray(data)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
        }

        console.log(`Received ${data.length} items to save.`);

        // 3. データベースに保存 (TODO: 実装に合わせて変更)
        // 例: Vercel Postgresの場合
        /*
        await sql`BEGIN`;
        // 既存データをクリアするか、Upsertするかは要件次第
        // await sql`DELETE FROM rankings WHERE world_id = ...`; 
        
        for (const item of data) {
            await sql`
                INSERT INTO rankings (item_id, item_name, ...)
                VALUES (${item.item_id}, ${item.item_name}, ...)
            `;
        }
        await sql`COMMIT`;
        */

        // ※DBがない場合は、一時的にログ出力のみで成功を返す
        
        return NextResponse.json({ 
            success: true, 
            message: 'Data synced successfully',
            count: data.length 
        });

    } catch (error) {
        console.error('Sync Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
```

### 3. `.github/workflows/update-ranking.yml`

**役割**: スケジュールに従ってスクリプトを実行するワークフロー定義です。

```yaml
name: Update Ranking Data

on:
  schedule:
    # 毎日 3:00, 15:00 JST (UTC 18:00, 6:00)
    - cron: '0 18 * * *'
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  update-ranking:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci

      - name: Run ranking update script
        # tsxを使ってTypeScriptファイルを直接実行
        run: npx tsx scripts/update-ranking.ts
        env:
          # GitHub Secretsから環境変数を注入
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          VERCEL_APP_URL: ${{ secrets.VERCEL_APP_URL }}
```

---

## セットアップ手順

### ステップ1: 必要なパッケージの確認

スクリプト実行に `tsx` (TypeScript Execute) を使用します。
`package.json` に特別な追加は不要ですが、ローカルでテストする場合はインストールしておくと便利です。

```bash
npm install -D tsx
```

### ステップ2: ファイルの作成

1. `mkdir scripts`
2. `scripts/update-ranking.ts` を作成（上記コード）
3. `mkdir -p src/app/api/sync-ranking`
4. `src/app/api/sync-ranking/route.ts` を作成（上記コード）
5. `.github/workflows/update-ranking.yml` を作成（上記コード）

### ステップ3: 環境変数の設定

#### Vercel側 (データ受信側)
- `CRON_SECRET`: 認証用の秘密鍵（ランダムな文字列）

#### GitHub側 (データ送信側)
- `CRON_SECRET`: Vercelと同じ値
- `VERCEL_APP_URL`: アプリのURL (例: `https://universalis-ranking.vercel.app`)
  - **注意**: 末尾に `/` をつけないこと

### ステップ4: デプロイとテスト

1. コードをGitHubにプッシュ
2. Vercelのデプロイ完了を待つ
3. GitHub Actionsのタブから `Update Ranking Data` を手動実行 (`Run workflow`)
4. 成功すれば、VercelのFunctionログに「Received X items to save.」と表示されます。

---

## データベース設定 (Turso)

Vercelのタイムアウト制限を回避するため、計算結果を外部データベース（Turso）に保存し、フロントエンドからはその保存済みデータを参照する構成にします。

### ステップ1: Tursoのセットアップ

1. **Tursoアカウント作成**: [Turso公式サイト](https://turso.tech/)からサインアップします。
2. **CLIのインストール**:
   ```bash
   # Windows (PowerShell)
   iwr https://web.install.turso.tech/turso.ps1 -useb | iex
   
   # Mac/Linux
   curl -sSfL https://get.tur.so/install.sh | bash
   ```
3. **ログインとデータベース作成**:
   ```bash
   turso auth login
   turso db create universalis-ranking
   ```
4. **接続情報の取得**:
   ```bash
   # データベースURL (例: libsql://universalis-ranking-user.turso.io)
   turso db show universalis-ranking --url
   
   # 認証トークン
   turso db tokens create universalis-ranking
   ```

### ステップ2: 環境変数の設定

Vercelのプロジェクト設定（Settings > Environment Variables）に以下を追加します。

- `TURSO_DATABASE_URL`: 上記で取得したURL
- `TURSO_AUTH_TOKEN`: 上記で取得したトークン

### ステップ3: 必要なパッケージのインストール

```bash
npm install @libsql/client
```

### ステップ4: DB接続クライアントの作成

`src/lib/turso.ts` を作成します。

```typescript
// src/lib/turso.ts
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error('Missing Turso environment variables');
}

export const turso = createClient({
  url,
  authToken,
});
```

### ステップ5: テーブル作成

初回のみ、以下のSQLを実行してテーブルを作成します（Turso CLIの `turso db shell universalis-ranking` またはアプリ内の初期化スクリプトで実行）。

```sql
CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  retainer_qty INTEGER DEFAULT 0,
  avg_price INTEGER DEFAULT 0,
  estimated_value INTEGER DEFAULT 0,
  total_sales_qty INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 検索を高速化するためのインデックス
CREATE INDEX IF NOT EXISTS idx_rankings_estimated_value ON rankings(estimated_value DESC);
```

---

## データ同期APIの実装 (保存側)

`src/app/api/sync-ranking/route.ts` を以下のように実装し、GitHub Actionsから受け取ったデータをTursoに保存します。

```typescript
// src/app/api/sync-ranking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { turso } from '@/lib/turso';
import type { RankingItem } from '@/types';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    try {
        // 1. 認証
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        
        if (token !== CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. データ受信
        const body = await request.json();
        const data: RankingItem[] = body.data;

        if (!Array.isArray(data)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
        }

        console.log(`Received ${data.length} items. Saving to Turso...`);

        // 3. トランザクションで一括保存
        // 既存データを削除して入れ替える方式（シンプル）
        const statements = [
            { sql: 'DELETE FROM rankings', args: [] }, // 全削除
        ];

        // 挿入クエリの作成
        for (const item of data) {
            statements.push({
                sql: `INSERT INTO rankings (
                    item_id, item_name, retainer_qty, avg_price, estimated_value, total_sales_qty, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                args: [
                    item.item_id,
                    item.item_name,
                    item.retainer_qty,
                    item.avg_price,
                    item.estimated_value,
                    item.total_sales_qty
                ]
            });
        }

        // Tursoは一度に実行できるステートメント数に制限がある場合があるため、
        // 大量データの場合は分割バッチ処理を推奨しますが、ここではシンプルに実装します。
        // ※数千件ある場合は、50-100件ずつに分割してexecuteBatchするか、
        // INSERT INTO ... VALUES (...), (...), (...) の形式にまとめるのがベターです。
        
        // 簡易実装: トランザクション実行
        await turso.batch(statements, 'write');

        return NextResponse.json({ 
            success: true, 
            message: 'Data synced successfully',
            count: data.length 
        });

    } catch (error) {
        console.error('Sync Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
```

---

## データ取得APIの実装 (表示側)

フロントエンドから呼び出すための、DBからデータを取得するAPIを作成します。
`src/app/api/ranking/cached/route.ts` (新規作成)

```typescript
// src/app/api/ranking/cached/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { turso } from '@/lib/turso';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        const sortBy = searchParams.get('sortBy') || 'value'; // value, price, sales

        let orderByClause = 'estimated_value DESC';
        if (sortBy === 'price') orderByClause = 'avg_price DESC';
        if (sortBy === 'sales') orderByClause = 'total_sales_qty DESC';

        // Tursoからデータ取得
        const result = await turso.execute({
            sql: `SELECT * FROM rankings ORDER BY ${orderByClause} LIMIT ?`,
            args: [limit]
        });

        // 配列形式に変換
        const items = result.rows.map(row => ({
            item_id: row.item_id,
            item_name: row.item_name,
            retainer_qty: row.retainer_qty,
            avg_price: row.avg_price,
            estimated_value: row.estimated_value,
            total_sales_qty: row.total_sales_qty
        }));

        return NextResponse.json({
            success: true,
            data: items,
            source: 'database' // DBからの取得であることを明示
        });

    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch rankings' },
            { status: 500 }
        );
    }
}
```

### フロントエンドでの利用

`src/components/RankingTable.tsx` や `page.tsx` で、fetch先を `/api/ranking` から `/api/ranking/cached` に切り替えるだけで、高速に表示できるようになります。

```typescript
// 例: フロントエンドでの取得
const response = await fetch('/api/ranking/cached?limit=100&sortBy=value');
const json = await response.json();
setRankings(json.data);
```
