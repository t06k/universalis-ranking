# 無料Cronジョブ実装ガイド - 完全版

このドキュメントでは、Vercel Freeプランの制限を回避して、GitHub Actionsを使用して無料でランキングデータを定期更新する方法を説明します。

## 📋 目次

1. [概要](#概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [必要なファイル](#必要なファイル)
4. [セットアップ手順](#セットアップ手順)
5. [動作確認](#動作確認)
6. [トラブルシューティング](#トラブルシューティング)
7. [次のステップ](#次のステップ)

---

## 概要

### 課題
- Vercel Freeプランでは、Cron Jobsが月2回までしか実行できない
- ランキングデータを定期的に更新したい（例: 1日2回）

### 解決策
- **GitHub Actions**を使用して無料でCronジョブを実行
- 月2,000分まで無料で利用可能
- 最短5分間隔で実行可能

### メリット
- ✅ 完全無料
- ✅ 信頼性が高い
- ✅ 実行履歴が残る
- ✅ 手動実行も可能
- ✅ 既存のGitHubリポジトリを活用

---

## アーキテクチャ

```
┌─────────────────────┐
│  GitHub Actions     │ ← スケジュール実行（無料）
│  (Cron Trigger)     │    毎日 3:00, 15:00 JST
└──────────┬──────────┘
           │ HTTP POST
           │ Authorization: Bearer <SECRET>
           ↓
┌─────────────────────┐
│ Vercel (Next.js)    │
│ /api/update-ranking │ ← 認証チェック
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ ランキング計算      │
│ - Universalis API   │
│ - リテイナーデータ  │
│ - アイテム名        │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ 結果を返却          │
│ (将来的にDBに保存)  │
└─────────────────────┘
```

---

## 必要なファイル

### 1. `/src/app/api/update-ranking/route.ts`

**役割**: Cron実行用のランキング更新エンドポイント

```typescript
// src/app/api/update-ranking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
    fetchMarketableIds,
    fetchAllHistories,
    filterRecentEntries
} from '@/lib/universalis';
import { loadRetainerItems, loadItemNames } from '@/lib/dataLoader';
import type { RankingItem } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 環境変数で設定したシークレットキーで認証
const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-key-here';

export async function POST(request: NextRequest) {
    try {
        // 認証チェック
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        
        if (token !== CRON_SECRET) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log('Starting scheduled ranking update...');

        // ランキング計算（既存のロジックを使用）
        const days = 5;
        const minSalesPerDay = 10;
        const worldId = 48;
        const maxItems = 300000;

        const [retainerMap, itemNames, marketableIds] = await Promise.all([
            loadRetainerItems(),
            loadItemNames(),
            fetchMarketableIds()
        ]);

        const targetIds = marketableIds.slice(0, maxItems);
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

        // TODO: ここでデータベースに保存
        // 例: await saveRankingToDatabase(results);

        console.log(`Ranking update completed. Processed ${results.length} items.`);

        return NextResponse.json({
            success: true,
            message: 'Ranking updated successfully',
            stats: {
                total_items: results.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Update Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
```

---

### 2. `.github/workflows/update-ranking.yml`

**役割**: GitHub Actionsワークフロー定義

```yaml
name: Update Ranking Data

on:
  schedule:
    # 毎日午前3時(JST) = UTC 18:00に実行
    - cron: '0 18 * * *'
    # 毎日午後3時(JST) = UTC 6:00にも実行（1日2回）
    - cron: '0 6 * * *'
  
  # 手動実行も可能にする
  workflow_dispatch:

jobs:
  update-ranking:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Trigger Ranking Update
        run: |
          response=$(curl -s -w "\n%{http_code}" -X POST \
            ${{ secrets.VERCEL_APP_URL }}/api/update-ranking \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json")
          
          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | sed '$d')
          
          echo "HTTP Status: $http_code"
          echo "Response: $body"
          
          if [ "$http_code" -ne 200 ]; then
            echo "Error: API returned status $http_code"
            exit 1
          fi
      
      - name: Notify on failure
        if: failure()
        run: |
          echo "❌ Ranking update failed!"
          # ここにSlack通知などを追加可能
```

---

## セットアップ手順

### ステップ1: シークレットキーの生成

ランダムな文字列を生成します。

#### PowerShellの場合:
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

#### Bashの場合:
```bash
openssl rand -base64 32
```

#### オンラインツール:
- https://www.random.org/strings/

**生成例**: `aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW`

⚠️ **重要**: この文字列を安全な場所にメモしてください！

📌 **セキュリティのベストプラクティス**:
- 最低32文字以上の長さを推奨
- 英数字と記号を混在させる
- 辞書に存在する単語を避ける
- 絶対にGitリポジトリにコミットしない
- パスワードマネージャーで管理することを推奨

---

### ステップ2: ファイルを作成

#### 2-1. APIエンドポイントを作成

```bash
# ディレクトリを作成
mkdir -p src/app/api/update-ranking

# ファイルを作成（上記のコードをコピー）
# src/app/api/update-ranking/route.ts
```

#### 2-2. GitHub Actionsワークフローを作成

```bash
# ディレクトリを作成
mkdir -p .github/workflows

# ファイルを作成（上記のYAMLをコピー）
# .github/workflows/update-ranking.yml
```

#### 2-3. Gitにコミット

```bash
git add .
git commit -m "Add cron job for ranking update"
git push origin main
```

---

### ステップ3: Vercelに環境変数を設定

1. **Vercelダッシュボード**にアクセス: https://vercel.com/dashboard
2. プロジェクトを選択
3. `Settings` → `Environment Variables` に移動
4. 以下を追加:

```
Name: CRON_SECRET
Value: <ステップ1で生成した文字列>
Environment: ✅ Production ✅ Preview ✅ Development
```

5. `Save` をクリック
6. **重要**: プロジェクトを再デプロイ
   - `Deployments` タブに移動
   - 最新のデプロイを選択
   - `⋯` メニュー → `Redeploy` をクリック

---

### ステップ4: GitHub Secretsを設定

1. **GitHubリポジトリ**にアクセス
2. `Settings` → `Secrets and variables` → `Actions` に移動
3. `New repository secret` をクリック

#### Secret 1: CRON_SECRET
```
Name: CRON_SECRET
Value: <ステップ1で生成した同じ文字列>
```

#### Secret 2: VERCEL_APP_URL
```
Name: VERCEL_APP_URL
Value: https://your-app-name.vercel.app
```

⚠️ **注意**: `your-app-name` を実際のVercelアプリ名に置き換えてください

**例**:
- アプリ名が `universalis-ranking` の場合
- URL: `https://universalis-ranking.vercel.app`

---

### ステップ5: GitHub Actionsを有効化

1. GitHubリポジトリの `Actions` タブに移動
2. 初回の場合、`I understand my workflows, go ahead and enable them` をクリック
3. `Update Ranking Data` ワークフローが表示されることを確認

---

## 動作確認

### テスト1: ローカルでAPIをテスト（オプション）

PowerShellの場合:
```powershell
$headers = @{
    "Authorization" = "Bearer YOUR_CRON_SECRET"
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "https://your-app-name.vercel.app/api/update-ranking" `
    -Method Post `
    -Headers $headers
```

Bashの場合:
```bash
curl -X POST https://your-app-name.vercel.app/api/update-ranking \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

**成功時のレスポンス**:
```json
{
  "success": true,
  "message": "Ranking updated successfully",
  "stats": {
    "total_items": 150,
    "timestamp": "2025-11-25T07:00:00.000Z"
  }
}
```

---

### テスト2: GitHub Actionsで手動実行

1. GitHubリポジトリの `Actions` タブに移動
2. 左サイドバーから `Update Ranking Data` を選択
3. `Run workflow` ボタンをクリック
4. `Run workflow` を再度クリック（確認）
5. 実行が開始されます（数秒～数分かかります）

**実行結果の確認**:
- ✅ 緑色のチェックマーク: 成功
- ❌ 赤色のバツマーク: 失敗

失敗した場合は、ワークフローをクリックしてログを確認してください。

---

## スケジュール設定

### 現在の設定

| 実行時刻 (JST) | Cron式 (UTC) | 説明 |
|----------------|--------------|------|
| 毎日 午前3時 | `0 18 * * *` | 深夜のデータ更新 |
| 毎日 午後3時 | `0 6 * * *` | 日中のデータ更新 |

### スケジュールの変更方法

`.github/workflows/update-ranking.yml` の `schedule` セクションを編集:

```yaml
schedule:
  - cron: '0 18 * * *'  # 分 時 日 月 曜日 (UTC)
```

#### Cron式の例

| 実行タイミング | Cron式 (UTC) | JST時刻 |
|----------------|--------------|---------|
| 毎時 | `0 * * * *` | - |
| 3時間ごと | `0 */3 * * *` | - |
| 6時間ごと | `0 */6 * * *` | - |
| 毎日午前0時 | `0 15 * * *` | 午前0時 |
| 毎日正午 | `0 3 * * *` | 正午12時 |
| 毎日午後6時 | `0 9 * * *` | 午後6時 |
| 毎週月曜午前9時 | `0 0 * * 1` | 午前9時 |

**注意事項**:
- GitHub Actionsのcronは**最短5分間隔**です
- UTC時刻で指定する必要があります（JST = UTC + 9時間）
- 実行タイミングは数分ずれる場合があります（通常±10分程度）
- 日本には夏時間がないため、UTC時刻との時差は常に9時間です

#### UTC → JST 変換表

| UTC | JST |
|-----|-----|
| 0:00 | 9:00 |
| 3:00 | 12:00 |
| 6:00 | 15:00 |
| 9:00 | 18:00 |
| 12:00 | 21:00 |
| 15:00 | 0:00 (翌日) |
| 18:00 | 3:00 (翌日) |
| 21:00 | 6:00 (翌日) |

---

## トラブルシューティング

### ❌ ワークフローが実行されない

**原因と対処法**:

1. **Actionsが無効になっている**
   - リポジトリの `Settings` → `Actions` → `General`
   - `Allow all actions and reusable workflows` を選択

2. **ワークフローファイルがmainブランチにない**
   - `git branch` で現在のブランチを確認
   - `git push origin main` でmainブランチにプッシュ

3. **YAML構文エラー**
   - `.github/workflows/update-ranking.yml` の構文を確認
   - インデントは**スペース2つ**（タブ不可）

4. **初回実行までに時間がかかる**
   - 初回のcronは、ファイルをプッシュしてから次のスケジュール時刻まで実行されません
   - 手動実行（`workflow_dispatch`）でテストしてください

---

### ❌ 401 Unauthorized エラー

**原因**:
- `CRON_SECRET` が一致していない

**対処法**:

1. **GitHub Secretsを確認**
   - `Settings` → `Secrets and variables` → `Actions`
   - `CRON_SECRET` の値を確認

2. **Vercel環境変数を確認**
   - Vercelダッシュボード → プロジェクト → `Settings` → `Environment Variables`
   - `CRON_SECRET` の値を確認

3. **値が一致しているか確認**
   - 両方の値が完全に一致している必要があります
   - 前後のスペースに注意

4. **Vercelを再デプロイ**
   - 環境変数を変更した後は、必ず再デプロイが必要です

---

### ❌ 404 Not Found エラー

**原因**:
- APIエンドポイントが存在しない
- URLが間違っている

**対処法**:

1. **ファイルが存在するか確認**
   ```bash
   ls src/app/api/update-ranking/route.ts
   ```

2. **Vercelにデプロイされているか確認**
   - ブラウザで `https://your-app-name.vercel.app/api/update-ranking` にアクセス
   - `{"success":false,"error":"Unauthorized"}` が返ればOK

3. **VERCEL_APP_URL を確認**
   - GitHub Secrets の `VERCEL_APP_URL` が正しいか確認
   - 末尾に `/` がないことを確認

---

### ❌ 500 Internal Server Error

**原因**:
- APIコード内でエラーが発生している

**対処法**:

1. **Vercelのログを確認**
   - Vercelダッシュボード → `Deployments` → 最新のデプロイ
   - `Functions` タブをクリック
   - `/api/update-ranking` のログを確認

2. **よくあるエラー**:
   - 環境変数が設定されていない
   - 外部API（Universalis）がタイムアウト
   - データベース接続エラー

3. **ローカルでテスト**
   ```bash
   npm run dev
   # 別のターミナルで
   curl -X POST http://localhost:3000/api/update-ranking \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

---

### ⏱️ タイムアウトエラー

**原因**:
- 処理に60秒以上かかっている

**対処法**:

1. **処理対象を減らす**
   - `route.ts` の `maxItems` を減らす
   ```typescript
   const maxItems = 100000; // 300000 → 100000
   ```

2. **Vercel Proプランにアップグレード**
   - Freeプラン: 最大60秒
   - Proプラン: 最大300秒

3. **並列処理を最適化**
   - バッチサイズを調整
   - 不要なAPIコールを削減

---

### 🚫 レート制限エラー (429 Too Many Requests)

**原因**:
- Universalis APIへのリクエストが多すぎる
- 短時間に大量のアイテムを処理している

**対処法**:

1. **リクエスト間隔を調整**
   - `src/lib/universalis.ts` の待機時間を増やす
   ```typescript
   await new Promise(resolve => setTimeout(resolve, 200)); // 100ms → 200ms
   ```

2. **並列処理数を減らす**
   ```typescript
   const maxConcurrent = 4; // 8 → 4
   ```

3. **処理アイテム数を減らす**
   ```typescript
   const maxItems = 100000; // より少なく
   ```

---

### 🔒 CORS エラー

**原因**:
- ブラウザから直接APIを呼び出そうとしている（該当する場合のみ）

**対処法**:

このCronジョブの実装では、GitHub ActionsからサーバーサイドAPIを呼び出すため、通常CORSエラーは発生しません。

もしブラウザから `/api/update-ranking` を呼び出す必要がある場合は、Next.jsのAPIルートに適切なCORSヘッダーを追加してください。

---

## モニタリング

### GitHub Actionsの実行履歴

**確認方法**:
1. GitHubリポジトリの `Actions` タブに移動
2. `Update Ranking Data` を選択
3. 過去の実行履歴が表示されます

**確認できる情報**:
- ✅ 成功/失敗の状態
- ⏱️ 実行時間
- 📝 詳細なログ
- 📅 実行日時

---

### Vercelのログ

**確認方法**:
1. Vercelダッシュボード → プロジェクト
2. `Deployments` タブ → 最新のデプロイ
3. `Functions` タブをクリック
4. `/api/update-ranking` を検索

**確認できる情報**:
- API呼び出しのログ
- `console.log()` の出力
- エラーメッセージ
- 実行時間

---

### 通知設定（オプション）

#### Slackに通知を送る

`.github/workflows/update-ranking.yml` に追加:

```yaml
- name: Notify Slack on success
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"✅ Ranking update succeeded!"}'

- name: Notify Slack on failure
  if: failure()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"❌ Ranking update failed!"}'
```

GitHub Secretsに `SLACK_WEBHOOK_URL` を追加してください。

---

## 次のステップ

### 1. データベースへの保存（推奨）

現在、毎回APIを呼び出すと計算に時間がかかります。以下の改善を推奨します:

#### アーキテクチャ変更

```
┌─────────────────┐
│ GitHub Actions  │ ← 定期実行
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ /api/update-    │ ← ランキング計算
│  ranking        │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Vercel Postgres │ ← 結果を保存
│  or Turso       │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ /api/ranking    │ ← キャッシュから取得
│  (GET)          │    (高速！)
└─────────────────┘
```

#### 実装例

```typescript
// /api/update-ranking/route.ts
import { sql } from '@vercel/postgres';

// ランキング計算後
await sql`
  INSERT INTO ranking_cache (data, updated_at)
  VALUES (${JSON.stringify(results)}, NOW())
  ON CONFLICT (id) DO UPDATE 
  SET data = ${JSON.stringify(results)}, updated_at = NOW()
`;
```

```typescript
// /api/ranking/route.ts
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  // キャッシュから取得（高速！）
  const { rows } = await sql`
    SELECT data, updated_at 
    FROM ranking_cache 
    ORDER BY updated_at DESC 
    LIMIT 1
  `;
  
  return NextResponse.json({
    success: true,
    data: JSON.parse(rows[0].data),
    cached_at: rows[0].updated_at
  });
}
```

**メリット**:
- ⚡ レスポンスが超高速（数ms）
- 💰 Universalis APIの呼び出し回数を削減
- 📊 過去のランキングデータを保存可能

---

### 2. キャッシュ戦略

Next.jsのキャッシュ機能を活用:

```typescript
// /api/ranking/route.ts
export const revalidate = 3600; // 1時間キャッシュ
```

---

### 3. 複数ワールド対応

複数のワールドのランキングを計算:

```yaml
# .github/workflows/update-ranking.yml
- name: Update World 48 (Ridill)
  run: curl -X POST ${{ secrets.VERCEL_APP_URL }}/api/update-ranking?worldId=48 ...

- name: Update World 49 (Masamune)
  run: curl -X POST ${{ secrets.VERCEL_APP_URL }}/api/update-ranking?worldId=49 ...
```

---

### 4. エラー通知の強化

Slack、Discord、メールなどで通知:

```yaml
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Ranking update failed!'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 代替案

### Cloudflare Workers + Cron Triggers

より正確なタイミングで実行したい場合:

**メリット**:
- ✅ 完全無料（1日100,000リクエスト）
- ✅ 最短1分間隔
- ✅ 正確なcron実行

**デメリット**:
- ❌ Cloudflareアカウントが必要
- ❌ 設定がやや複雑

**実装例**:

```typescript
// cloudflare-worker/src/index.ts
export default {
  async scheduled(event, env, ctx) {
    await fetch('https://your-app.vercel.app/api/update-ranking', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CRON_SECRET}`
      }
    });
  }
}
```

```toml
# wrangler.toml
[triggers]
crons = ["0 */6 * * *"]  # 6時間ごと
```

---

### 外部Cronサービス

**おすすめサービス**:

1. **cron-job.org** (無料)
   - 最短1分間隔
   - 無制限実行
   - https://cron-job.org/

2. **EasyCron** (無料プラン)
   - 月80回まで
   - https://www.easycron.com/

3. **Render Cron Jobs** (無料)
   - 月750時間まで
   - https://render.com/

**設定方法**:
1. サービスに登録
2. URL: `https://your-app.vercel.app/api/update-ranking`
3. Method: `POST`
4. Header: `Authorization: Bearer YOUR_CRON_SECRET`
5. Schedule: `0 */6 * * *`

---

## コスト比較

| 方法 | 月額コスト | 実行回数制限 | 最短間隔 | 信頼性 |
|------|------------|--------------|----------|--------|
| **GitHub Actions** | **無料** | 月2,000分 | 5分 | ⭐⭐⭐⭐⭐ |
| Vercel Cron (Hobby) | 無料 | 月2回 | 1分 | ⭐⭐⭐⭐⭐ |
| Vercel Cron (Pro) | $20 | 無制限 | 1分 | ⭐⭐⭐⭐⭐ |
| Cloudflare Workers | 無料 | 1日100,000回 | 1分 | ⭐⭐⭐⭐⭐ |
| cron-job.org | 無料 | 無制限 | 1分 | ⭐⭐⭐⭐ |
| Railway | $5~ | 無制限 | 1分 | ⭐⭐⭐⭐ |

**推奨**: GitHub Actions（完全無料で信頼性が高い）

---

## まとめ

### ✅ 実装完了チェックリスト

- [ ] `/src/app/api/update-ranking/route.ts` を作成
- [ ] `.github/workflows/update-ranking.yml` を作成
- [ ] シークレットキーを生成
- [ ] Vercelに `CRON_SECRET` を設定
- [ ] Vercelを再デプロイ
- [ ] GitHub Secretsに `CRON_SECRET` を設定
- [ ] GitHub Secretsに `VERCEL_APP_URL` を設定
- [ ] GitHub Actionsを有効化
- [ ] 手動実行でテスト
- [ ] 実行履歴を確認

### 🎯 期待される結果

- ✅ 毎日午前3時と午後3時に自動実行
- ✅ 完全無料
- ✅ 実行履歴が残る
- ✅ 手動実行も可能

### 📞 サポート

問題が発生した場合:
1. [トラブルシューティング](#トラブルシューティング)を確認
2. GitHub Actionsのログを確認
3. Vercelのログを確認
4. 必要に応じて質問してください

---

**作成日**: 2025-11-25  
**バージョン**: 1.0
