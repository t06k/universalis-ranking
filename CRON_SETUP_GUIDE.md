# 無料Cronジョブ実装ガイド - 日次集計積み上げ方式

このドキュメントでは、Vercelの制限を回避しつつ、データの柔軟な集計を可能にする**「日次集計積み上げ方式」**の実装手順を説明します。

## 📋 目次

1. [概要とアーキテクチャ](#概要とアーキテクチャ)
2. [データベース設定 (Turso)](#データベース設定-turso)
3. [実装手順](#実装手順)
   - [集計スクリプト (GitHub Actions)](#1-集計スクリプト-scriptsupdate-rankingts)
   - [データ保存API (Next.js)](#2-データ保存api-srcappapisync-rankingroutets)
   - [データ取得・表示API (Next.js)](#3-データ取得表示api-srcappapirankingcachedroutets)
   - [ワークフロー定義 (GitHub Actions)](#4-ワークフロー定義-githubworkflowsupdate-rankingyml)
4. [実行頻度の変更方法](#実行頻度の変更方法)

---

## 概要とアーキテクチャ

### 方式の特徴：日次集計積み上げ
巨大な生データをそのまま保存するのではなく、**「1日ごとの統計データ」**に圧縮して保存します。

- **GitHub Actions**: 毎日実行し、直近のデータを取得。「日付×アイテム」ごとの売上・価格を集計して送信します。
- **Turso (DB)**: 日次データを蓄積します（例: 1年分でも365行/アイテム なので軽量）。
- **Webアプリ**: DBからデータを取得する際、指定された期間（3日、7日など）のデータをSQLで合算して表示します。

### メリット
- ✅ **高速**: 外部APIを叩くより圧倒的に速い。
- ✅ **柔軟**: 「直近3日」「直近1ヶ月」など、期間を自由に変更可能。
- ✅ **堅牢**: 過去数日分をまとめて更新する方式にすることで、1回実行が失敗しても次回でリカバリ可能。

---

## データベース設定 (Turso)

### 1. セットアップ
Tursoのアカウント作成とCLIセットアップがまだの場合は実施してください。

```bash
# ログインとDB作成
turso auth login
turso db create universalis-ranking

# 接続情報の取得（環境変数設定に使用）
turso db show universalis-ranking --url
turso db tokens create universalis-ranking
```

### 2. テーブル作成
以下のSQLを実行して、日次集計用のテーブルを作成します。
`item_id` と `date` の組み合わせを主キー（PRIMARY KEY）にすることで、重複を防ぎます。

```sql
CREATE TABLE IF NOT EXISTS daily_rankings (
  item_id INTEGER NOT NULL,
  date TEXT NOT NULL,       -- YYYY-MM-DD 形式
  item_name TEXT,
  retainer_qty INTEGER DEFAULT 0,
  sales_qty INTEGER DEFAULT 0,
  total_sales_gil INTEGER DEFAULT 0,
  avg_price INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, date)
);

-- 集計・検索用のインデックス
CREATE INDEX IF NOT EXISTS idx_daily_rankings_date ON daily_rankings(date);
CREATE INDEX IF NOT EXISTS idx_daily_rankings_item_id ON daily_rankings(item_id);
```

---

## 実装手順

### 1. 集計スクリプト (`scripts/update-ranking.ts`)

GitHub Actions上で実行され、Universalisからデータを取得し、日別に集計してAPIに送信します。
※リカバリを考慮し、実行時は「過去3日分」のデータを計算して送信する設定にします。

```typescript
// scripts/update-ranking.ts
import { fetchMarketableIds, fetchAllHistories } from '../src/lib/universalis';
import { loadRetainerItems, loadItemNames } from '../src/lib/dataLoader';
import { format, subDays, isSameDay, parseISO } from 'date-fns';

// 型定義
interface DailyRankingData {
    item_id: number;
    date: string; // YYYY-MM-DD
    item_name: string;
    retainer_qty: number;
    sales_qty: number;
    total_sales_gil: number;
    avg_price: number;
}

const VERCEL_APP_URL = process.env.VERCEL_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!VERCEL_APP_URL || !CRON_SECRET) {
    console.error('Missing environment variables');
    process.exit(1);
}

async function main() {
    console.log('Starting daily ranking calculation...');

    try {
        const worldId = 48;
        const maxItems = 2000; // テスト用: 本番では増やしてください
        const targetDays = 3;  // 過去3日分を計算（リカバリ用）

        // 1. マスタデータ読み込み
        const [retainerMap, itemNames, marketableIds] = await Promise.all([
            loadRetainerItems(),
            loadItemNames(),
            fetchMarketableIds()
        ]);

        const targetIds = marketableIds.slice(0, maxItems);
        
        // 2. 履歴データ取得 (過去1週間分程度あれば十分)
        const histories = await fetchAllHistories(targetIds, worldId, 50);

        const payload: DailyRankingData[] = [];
        const today = new Date();

        // 3. 日別集計処理
        for (let i = 0; i < targetDays; i++) {
            const targetDate = subDays(today, i);
            const dateStr = format(targetDate, 'yyyy-MM-dd');
            
            console.log(`Processing date: ${dateStr}`);

            for (const [itemIdStr, data] of Object.entries(histories)) {
                const itemId = parseInt(itemIdStr);
                const entries = data.entries || [];
                
                // 対象日の取引のみ抽出
                // ※Universalisのtimestampは秒単位(UNIX time)の場合とミリ秒の場合があるので注意
                // ここではミリ秒(13桁)と仮定、もし秒なら * 1000 が必要
                const dailyEntries = entries.filter(e => {
                    const entryDate = new Date(e.timestamp * 1000); 
                    return isSameDay(entryDate, targetDate);
                });

                if (dailyEntries.length === 0) continue;

                const salesQty = dailyEntries.reduce((sum, e) => sum + e.quantity, 0);
                const totalSalesGil = dailyEntries.reduce((sum, e) => sum + (e.quantity * e.pricePerUnit), 0);
                const avgPrice = salesQty > 0 ? Math.round(totalSalesGil / salesQty) : 0;
                
                const itemName = itemNames[itemIdStr]?.ja || `ID:${itemId}`;
                const retainerQty = retainerMap[itemId] || 0;

                payload.push({
                    item_id: itemId,
                    date: dateStr,
                    item_name: itemName,
                    retainer_qty: retainerQty,
                    sales_qty: salesQty,
                    total_sales_gil: totalSalesGil,
                    avg_price: avgPrice
                });
            }
        }

        console.log(`Generated ${payload.length} daily records.`);

        // 4. データ送信 (分割送信を推奨)
        const chunkSize = 500;
        for (let i = 0; i < payload.length; i += chunkSize) {
            const chunk = payload.slice(i, i + chunkSize);
            console.log(`Sending chunk ${i / chunkSize + 1}... (${chunk.length} items)`);

            const response = await fetch(`${VERCEL_APP_URL}/api/sync-ranking`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CRON_SECRET}`
                },
                body: JSON.stringify({ data: chunk })
            });

            if (!response.ok) {
                throw new Error(`Failed to sync: ${response.status} ${await response.text()}`);
            }
        }

        console.log('All data synced successfully.');

    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

main();
```

### 2. データ保存API (`src/app/api/sync-ranking/route.ts`)

受け取ったデータをTursoに保存します。`INSERT OR REPLACE` (Upsert) を使用して、既存データがあれば更新します。

```typescript
// src/app/api/sync-ranking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { turso } from '@/lib/turso';

export const dynamic = 'force-dynamic';
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (authHeader?.replace('Bearer ', '') !== CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const data = body.data; // DailyRankingData[]

        if (!Array.isArray(data)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        const statements = data.map(item => ({
            sql: `INSERT INTO daily_rankings (
                    item_id, date, item_name, retainer_qty, sales_qty, total_sales_gil, avg_price, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(item_id, date) DO UPDATE SET
                    retainer_qty = excluded.retainer_qty,
                    sales_qty = excluded.sales_qty,
                    total_sales_gil = excluded.total_sales_gil,
                    avg_price = excluded.avg_price,
                    updated_at = CURRENT_TIMESTAMP`,
            args: [
                item.item_id, item.date, item.item_name, item.retainer_qty,
                item.sales_qty, item.total_sales_gil, item.avg_price
            ]
        }));

        await turso.batch(statements, 'write');

        return NextResponse.json({ success: true, count: data.length });
    } catch (error) {
        console.error('Sync Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
```

### 3. データ取得・表示API (`src/app/api/ranking/cached/route.ts`)

フロントエンドからのリクエストに応じて、指定期間のデータを集計して返します。

```typescript
// src/app/api/ranking/cached/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { turso } from '@/lib/turso';
import { subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '5'); // 集計期間
        const limit = parseInt(searchParams.get('limit') || '50');
        const sortBy = searchParams.get('sortBy') || 'value';

        // 集計開始日を計算
        const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

        // ソート条件
        let orderBy = 'estimated_value DESC';
        if (sortBy === 'price') orderBy = 'avg_price DESC';
        if (sortBy === 'sales') orderBy = 'total_sales_qty DESC';

        // SQL: 期間内のデータをアイテムごとにGROUP BYして集計
        const sql = `
            SELECT 
                item_id,
                item_name,
                MAX(retainer_qty) as retainer_qty,
                SUM(sales_qty) as total_sales_qty,
                SUM(total_sales_gil) as total_sales_gil,
                CAST(SUM(total_sales_gil) * 1.0 / NULLIF(SUM(sales_qty), 0) AS INTEGER) as avg_price,
                (CAST(SUM(total_sales_gil) * 1.0 / NULLIF(SUM(sales_qty), 0) AS INTEGER) * MAX(retainer_qty)) as estimated_value
            FROM daily_rankings
            WHERE date >= ?
            GROUP BY item_id, item_name
            HAVING total_sales_qty > 0
            ORDER BY ${orderBy}
            LIMIT ?
        `;

        const result = await turso.execute({
            sql,
            args: [startDate, limit]
        });

        const items = result.rows.map(row => ({
            item_id: row.item_id,
            item_name: row.item_name,
            retainer_qty: row.retainer_qty,
            avg_price: row.avg_price || 0,
            estimated_value: row.estimated_value || 0,
            total_sales_qty: row.total_sales_qty
        }));

        return NextResponse.json({ success: true, data: items, days });

    } catch (error) {
        console.error('DB Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
```

### 4. ワークフロー定義 (`.github/workflows/update-ranking.yml`)

```yaml
name: Update Ranking Data

on:
  schedule:
    # 毎日 18:00 UTC (日本時間 3:00) に実行
    - cron: '0 18 * * *'
  workflow_dispatch:

jobs:
  update-ranking:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run script
        run: npx tsx scripts/update-ranking.ts
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          VERCEL_APP_URL: ${{ secrets.VERCEL_APP_URL }}
```

---

## 実行頻度の変更方法

データの更新頻度を変更したい場合は、`.github/workflows/update-ranking.yml` の `cron` 設定を変更します。

### Cron式の書き方
形式: `分 時 日 月 曜日` (UTC時間)

| 記述 | 意味 (UTC) | 日本時間 (JST) |
| :--- | :--- | :--- |
| `'0 18 * * *'` | 毎日 18:00 | 翌日 03:00 (深夜) |
| `'0 9 * * *'` | 毎日 09:00 | 同日 18:00 (夕方) |
| `'0 */6 * * *'` | 6時間おき | 6時間おき |
| `'0 21 * * 5'` | 金曜 21:00 | 土曜 06:00 |

### 変更手順
1. `.github/workflows/update-ranking.yml` を開く。
2. `on: schedule: - cron: '...'` の部分を書き換える。
3. GitHubへPushする。

**注意**: GitHub Actionsのスケジュール実行は、指定時刻から**数分〜数十分遅れる**ことがあります。厳密な時刻実行は保証されません。

