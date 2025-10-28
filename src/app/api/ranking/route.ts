// src/app/api/ranking/route.ts
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
// Vercel の実行時間制限（秒）
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '3');
        const minSalesPerDay = parseInt(searchParams.get('minSales') || '1');
        const maxItems = parseInt(searchParams.get('maxItems') || '60000');
        const topN = parseInt(searchParams.get('top') || '20');
        console.log('Starting ranking calculation...', { days, minSalesPerDay, maxItems });
        // 1. データ読み込み
        const [retainerMap, itemNames, marketableIds] = await Promise.all([
            loadRetainerItems(),
            loadItemNames(),
            fetchMarketableIds()
        ]);
        console.log(`Loaded: ${Object.keys(retainerMap).length} retainer items, ${marketableIds.length} marketable items`);

        // 2. 対象アイテムを制限
        const targetIds = marketableIds.slice(0, maxItems);
        // 3. 履歴データ取得
        const histories = await fetchAllHistories(targetIds, 100);
        console.log(`Fetched histories for ${Object.keys(histories).length} items`);

        // 4. ランキング計算
        const results: RankingItem[] = [];
        const minTotalSales = minSalesPerDay * days;

        for (const [itemIdStr, data] of Object.entries(histories)) {
            const itemId = parseInt(itemIdStr);
            const entries = data.entries || [];

            // 期間内のデータをフィルタ
            const recentEntries = filterRecentEntries(entries, days);
            // 販売数チェック
            const totalQty = recentEntries.reduce((sum, e) => sum + e.quantity, 0);
            if (totalQty < minTotalSales) {
                continue;
            }

            // 平均価格計算
            const totalSales = recentEntries.reduce(
                (sum, e) => sum + e.quantity * e.pricePerUnit,
                0
            );
            const avgPrice = totalQty > 0 ? totalSales / totalQty : 0;

            // リテイナー数量
            const retainerQty = retainerMap[itemId] ||
                0;
            if (retainerQty === 0) {
                continue;
            }

            // アイテム名取得
            const itemName = itemNames[itemIdStr]?.ja ||
                `ID:${itemId}`;

            results.push({
                item_id: itemId,
                item_name: itemName,
                retainer_qty: retainerQty,
                avg_price: Math.round(avgPrice),
                estimated_value: Math.round(avgPrice * retainerQty)
            });
        }

        // 5. ソートして上位N件
        const rankedResults = results
            .sort((a, b) => b.estimated_value - a.estimated_value)
            .slice(0, topN);

        console.log(`Returning top ${rankedResults.length} items`);
        return NextResponse.json({
            success: true,
            data: rankedResults,
            metadata: {
                total_evaluated: targetIds.length,
                total_matched: results.length,
                returned: rankedResults.length,
                parameters: { days, minSalesPerDay, maxItems, topN }
            }
        });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}