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

## データベース保存について (推奨)

この構成では `sync-ranking` APIでデータを受け取った後、永続化する必要があります。
Vercel Postgresを使用する場合の例：

1. VercelダッシュボードでStorage (Postgres) を作成
2. プロジェクトに接続 (`.env` が自動設定される)
3. `npm install @vercel/postgres`
4. `sync-ranking/route.ts` で `sql` クエリを使って `INSERT` する

これにより、Webサイト側 (`page.tsx`) は毎回Universalis APIを叩くのではなく、自分のDBから高速にデータを取得できるようになります。
