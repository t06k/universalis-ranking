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
        <div className="space-y-6">
            {metadata && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-blue-600 font-medium">評価対象</p>
                        <p className="text-2xl font-bold text-blue-900">{formatNumber(metadata.total_evaluated)}</p>
                        <p className="text-xs text-blue-600 mt-1">アイテム</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-green-600 font-medium">条件合致</p>
                        <p className="text-2xl font-bold text-green-900">{formatNumber(metadata.total_matched)}</p>
                        <p className="text-xs text-green-600 mt-1">アイテム</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-sm text-purple-600 font-medium">表示中</p>
                        <p className="text-2xl font-bold text-purple-900">{formatNumber(metadata.returned)}</p>
                        <p className="text-xs text-purple-600 mt-1">アイテム</p>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">順位</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">アイテム名</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">リテイナー数量</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">平均価格</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">推定価値</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((item, index) => (
                                <tr key={item.item_id} className={`hover:bg-gray-50 transition-colors ${index < 3 ? 'bg-yellow-50' : ''}`}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            {index < 3 ? (
                                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 text-white font-bold text-sm">
                                                    {index + 1}
                                                </span>
                                            ) : (
                                                <span className="text-sm font-medium text-gray-900">{index + 1}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                                        <div className="text-xs text-gray-500">ID: {item.item_id}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-sm text-gray-900">{formatNumber(item.retainer_qty)}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-sm text-gray-900">{formatNumber(item.avg_price)} gil</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-sm font-bold text-gray-900">{formatNumber(item.estimated_value)} gil</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {data.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">該当するデータがありません</p>
                </div>
            )}
        </div>
    );
}