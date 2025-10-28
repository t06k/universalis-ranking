// src/lib/universalis.ts
import type { UniversalisHistoryResponse } from '@/types';

const WORLD_ID = 45; // デフォルトワールドID（必要に応じて変更）
const BASE_URL = 'https://universalis.app/api/v2';
/**
 * Universalis API からマーケット対象アイテムIDを取得
 */
export async function fetchMarketableIds(): Promise<number[]> {
    try {
        const response = await fetch(`${BASE_URL}/marketable`, {
            next: { revalidate: 3600 } // 1時間キャッシュ
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.filter((id: number) => id != null);
    } catch (error) {
        console.error('Failed to fetch marketable IDs:', error);
        throw error;
    }
}

/**
 * バルクAPIで複数アイテムの履歴を取得
 */
export async function fetchHistoryBulk(
    itemIds: number[],
    worldId: number = WORLD_ID
): Promise<UniversalisHistoryResponse['items']> {
    const idsStr = itemIds.join(',');
    const url = `${BASE_URL}/history/${worldId}/${idsStr}?entriesToReturn=500`;

    try {
        const response = await fetch(url, {
            next: { revalidate: 300 } // 5分キャッシュ
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: UniversalisHistoryResponse = await response.json();
        return data.items || {};
    } catch (error) {
        console.error(`Failed to fetch history for batch:`, error);
        return {};
    }
}

/**
 * バッチ処理で全アイテムの履歴を取得
 */
export async function fetchAllHistories(
    itemIds: number[],
    batchSize: number = 100
): Promise<UniversalisHistoryResponse['items']> {
    const batches: number[][] = [];
    // バッチに分割
    for (let i = 0; i < itemIds.length; i += batchSize) {
        batches.push(itemIds.slice(i, i + batchSize));
    }

    const histories: UniversalisHistoryResponse['items'] = {};

    // 並列リクエスト（最大8並列）
    const maxConcurrent = 8;
    for (let i = 0; i < batches.length; i += maxConcurrent) {
        const chunk = batches.slice(i, i + maxConcurrent);
        const promises = chunk.map(batch => fetchHistoryBulk(batch));

        const results = await Promise.allSettled(promises);
        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                Object.assign(histories, result.value);
            }
        });
        // Rate limit 対策（少し待機）
        if (i + maxConcurrent < batches.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return histories;
}

/**
 * 指定期間内の取引データをフィルタリング
 */
export function filterRecentEntries(
    entries: any[],
    days: number = 3
): any[] {
    const now = Date.now();
    const threshold = now - (days * 24 * 60 * 60 * 1000);
    return entries.filter(entry => entry.timestamp * 1000 > threshold);
}