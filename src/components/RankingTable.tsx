// src/components/RankingTable.tsx
import type { RankingItem } from '@/types';
interface RankingTableProps {
    data: RankingItem[];
    metadata?: {
        total_evaluated: number;
        total_matched: number;
        returned: number;
    };
}

export default function RankingTable({ data, metadata }: RankingTableProps) {
    const formatNumber = (num: number): string => {
        return num.toLocaleString('ja-JP');
    };

    return (
        <div className="space-y-4">
            {/* ランキングリスト */}
            {data.map((item, index) => (
                <div key={item.item_id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    {/* ヘッダー部分 */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center">
                                <span className="text-xs text-gray-500 mb-1">No.{index + 1}</span>
                                {index === 0 && <span className="text-2xl">👑</span>}
                                {index === 1 && <span className="text-2xl">🥈</span>}
                                {index === 2 && <span className="text-2xl">🥉</span>}
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">{item.item_name}</h3>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                            {/* <div>{new Date().toLocaleString('ja-JP')} 更新</div> */}
                            <div className="mt-1">
                                {/* <span className="inline-block">🌐 Universalis</span> */}
                            </div>
                        </div>
                    </div>

                    {/* 推定価値と取引数 */}
                    <div className="flex items-center gap-6 mb-6">
                        <div className="flex items-center gap-2">
                            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-bold">
                                総取引額
                            </span>
                            <span className="text-2xl font-bold text-gray-800">
                                {formatNumber(item.total_sales)}
                            </span>
                            <span className="text-sm text-gray-600"> ギル</span>
                        </div>
                    </div>

                    {/* 統計情報 */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gray-50 rounded p-4 text-center">
                            <div className="text-xs text-gray-600 mb-2">平均単価</div>
                            <span className="text-lg font-bold text-gray-800">
                                {formatNumber(item.avg_price)}
                            </span>
                            <span className="text-xs text-gray-600 mt-1"> ギル</span>
                        </div>

                        <div className="bg-gray-50 rounded p-4 text-center">
                            <div className="text-xs text-gray-600 mb-2">平均個数</div>
                            <div className="text-lg font-bold text-gray-800">{item.avg_qty}</div>
                        </div>

                        <div className="bg-gray-50 rounded p-4 text-center">
                            <div className="text-xs text-gray-600 mb-2">販売数</div>
                            <span className="text-lg font-bold text-gray-800">
                                {formatNumber(item.total_sales_qty)}
                            </span>
                            <span className="text-xs text-gray- mt-1"> 個</span>
                        </div>
                    </div>
                </div>
            ))}

            {data.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                    <p className="text-gray-500">該当するデータがありません</p>
                </div>
            )}
        </div>
    );
}