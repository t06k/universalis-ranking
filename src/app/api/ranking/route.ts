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
export const maxItems = 300000;
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '5');
        const minSalesPerDay = parseInt(searchParams.get('minSales') || '100');
        const topN = parseInt(searchParams.get('top') || '30');
        const worldId = parseInt(searchParams.get('worldId') || '48');
        const sortBy = searchParams.get('sortBy') || 'value';



        // ▼ 1. チェックボックスの状態を取得 ▼
        const retainerCheck = searchParams.get('retainer_check') === 'true'

        console.log('Starting ranking calculation...', { days, minSalesPerDay, retainerCheck, worldId, sortBy });

        // 1. データ読み込み (loadRetainerItems は常に実行)
        const [retainerMap, itemNames, marketableIds] = await Promise.all([
            loadRetainerItems(),
            loadItemNames(),
            fetchMarketableIds()
        ]);
        console.log(`Loaded: ${Object.keys(retainerMap).length} retainer items, ${marketableIds.length} marketable items`);

        // 2. 対象アイテムを制限
        const targetIds = marketableIds.slice(0, maxItems);

        // 3. 履歴データ取得
        const histories = await fetchAllHistories(targetIds, worldId, 100);
        console.log(`Fetched histories for ${Object.keys(histories).length} items`);

        // 4. ランキング計算
        const results: RankingItem[] = [];
        // const results: any[] = []; 
        const minTotalSales = minSalesPerDay * days;

        for (const [itemIdStr, data] of Object.entries(histories)) {
            const itemId = parseInt(itemIdStr);
            const entries = data.entries || [];

            // 期間内のデータをフィルタ
            const recentEntries = filterRecentEntries(entries, days);

            // 販売数
            const totalQty = recentEntries.reduce((sum, e) => sum + e.quantity, 0);
            // 販売数チェック
            if (totalQty < minTotalSales) {
                continue;
            }

            // 総販売額
            const totalSales = recentEntries.reduce(
                (sum, e) => sum + e.quantity * e.pricePerUnit,
                0
            );

            // 平均価格(単価)
            const avgPrice = totalQty > 0 ? totalSales / totalQty : 0;

            // リテイナー数量
            const retainerQty = retainerMap[itemId] || 0;

            // ▼ 2. retainerCheckがONの場合のみ、リテイナー品以外を除外 ▼
            if (retainerCheck && retainerQty === 0) {
                continue;
            }

            // アイテム名取得
            const itemName = itemNames[itemIdStr]?.ja || `ID:${itemId}`;

            // ▼ 3. 推定価値の計算を調整 ▼
            // retainerCheckがOFFの場合、リテイナー品でなくても (qty=0)、
            // 数量1として推定価値を計算する
            const qtyForCalc = (retainerQty > 0) ? retainerQty : 1;
            const estimatedValue = Math.round(avgPrice * qtyForCalc);

            results.push({
                item_id: itemId,
                item_name: itemName,
                retainer_qty: retainerQty, // 実際の数量を渡す
                avg_price: Math.round(avgPrice),
                estimated_value: estimatedValue, // 計算に使用した推定価値
                total_sales_qty: totalQty // ソート用に販売数を保持
            });
        }

        // ▼ 5. 指定されたキーでソート ▼
        const rankedResults = results.sort((a, b) => {
            if (sortBy === 'price') {
                return b.avg_price - a.avg_price; // 平均単価順
            } else if (sortBy === 'sales') {
                return b.total_sales_qty - a.total_sales_qty; // 販売数順
            } else {
                return b.estimated_value - a.estimated_value; // デフォルト: 取引額順
            }
        }).slice(0, topN);

        console.log(`Returning top ${rankedResults.length} items`);
        return NextResponse.json({
            success: true,
            data: rankedResults,
            metadata: {
                total_evaluated: targetIds.length,
                total_matched: results.length,
                returned: rankedResults.length,
                parameters: { days, minSalesPerDay, maxItems, topN, retainerCheck, sortBy }
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