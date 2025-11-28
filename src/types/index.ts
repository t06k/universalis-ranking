// src/types/index.ts

export interface RankingItem {
    item_id: number;
    item_name: string;
    retainer_qty: number;
    avg_price: number;
    total_sales: number;
    estimated_value: number;
    total_sales_qty: number;
    total_trades: number;
    avg_qty: number;
}

export interface HistoryEntry {
    timestamp: number;
    quantity: number;
    pricePerUnit: number;
}

export interface UniversalisHistoryResponse {
    items: {
        [itemId: string]: {
            entries: HistoryEntry[];
        };
    };
}

export interface RetainerItem {
    [itemId: number]: number;
    // item_id: quantity
}

export interface ItemNameMap {
    [itemId: string]: {
        ja?: string;
        en?: string;
    };
}