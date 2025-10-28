// src/lib/dataLoader.ts
import Papa from 'papaparse';
import { promises as fs } from 'fs';
import path from 'path';
import type { RetainerItem as RetainerItemMap, ItemNameMap } from '@/types';

/**
 * CSV から リテイナー取得アイテムを読み込む
 */
export async function loadRetainerItems(): Promise<RetainerItemMap> {
    try {
        const filePath = path.join(process.cwd(), 'public', 'data', 'RetainerTaskNormal.csv');
        const csvText = await fs.readFile(filePath, 'utf-8');

        // CSVを行ごとに分割
        const lines = csvText.split('\n');

        // 最初の3行をスキップ（key行、#ヘッダー行、型定義行）
        const dataLines = lines.slice(3).filter(line => line.trim().length > 0);

        // ヘッダー行（2行目）からカラム名を取得
        const headerLine = lines[1];
        const headers = headerLine.split(',');

        console.log('CSV headers:', headers);
        console.log('Data lines:', dataLines.length);

        const retainerMap: RetainerItemMap = {};

        dataLines.forEach((line, index) => {
            const values = line.split(',');

            // Item列（インデックス1）とQuantity[4]列（インデックス5）を取得
            const itemId = parseInt(values[1]);
            const quantity = parseInt(values[5]); // Quantity[4]は6番目の列（インデックス5）

            if (!isNaN(itemId) && !isNaN(quantity) && quantity > 0) {
                retainerMap[itemId] = quantity;
            }

            // 最初の5行をログ出力（デバッグ用）
            if (index < 5) {
                console.log(`Row ${index}:`, {
                    itemId,
                    quantity,
                    raw: values
                });
            }
        });

        console.log('Loaded retainer items:', Object.keys(retainerMap).length);
        console.log('Sample items:', Object.entries(retainerMap).slice(0, 5));

        return retainerMap;
    } catch (error) {
        console.error('Failed to load retainer items:', error);
        throw error;
    }
}

/**
 * JSON から アイテム名マスタを読み込む
 */
export async function loadItemNames(): Promise<ItemNameMap> {
    try {
        const filePath = path.join(process.cwd(), 'public', 'data', 'item_id.json');
        const jsonText = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(jsonText);
        console.log('Loaded item names:', Object.keys(data).length);
        return data;
    } catch (error) {
        console.error('Failed to load item names:', error);
        return {};
    }
}