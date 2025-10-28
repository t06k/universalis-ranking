// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import RankingTable from '@/components/RankingTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import type { RankingItem } from '@/types';

interface ApiResponse {
  success: boolean;
  data?: RankingItem[];
  metadata?: {
    total_evaluated: number;
    total_matched: number;
    returned: number;
    parameters: any;
  };
  error?: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RankingItem[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState('ranking');

  const [days, setDays] = useState(3);
  const [minSales, setMinSales] = useState(1);
  const [maxItems, setMaxItems] = useState(10000);
  const [topN, setTopN] = useState(20);

  const fetchRanking = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: days.toString(),
        minSales: minSales.toString(),
        maxItems: maxItems.toString(),
        top: topN.toString()
      });

      const response = await fetch(`/api/ranking?${params}`);
      const result: ApiResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'データ取得に失敗しました');
      }

      setData(result.data || []);
      setMetadata(result.metadata);
      setCurrentTime(new Date().toLocaleString('ja-JP'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRanking();
  }, []);

  return (
    <div className="min-h-screen bg-[#e8e4d9]">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">リテイナー効率ランキング</h1>
        </div>
      </header>

      {/* タブ */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex gap-0">
            <button
              onClick={() => setSelectedTab('ranking')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${selectedTab === 'ranking'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
            >
              推定価値でランキング！
            </button>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="container mx-auto px-4 py-8">
        {/* パラメータ設定 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">検索条件</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                集計期間（日）
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                min="1"
                max="30"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最低販売数/日
              </label>
              <input
                type="number"
                value={minSales}
                onChange={(e) => setMinSales(parseInt(e.target.value))}
                min="1"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                評価対象数
              </label>
              <input
                type="number"
                value={maxItems}
                onChange={(e) => setMaxItems(parseInt(e.target.value))}
                min="100"
                max="60000"
                step="1000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                表示件数
              </label>
              <input
                type="number"
                value={topN}
                onChange={(e) => setTopN(parseInt(e.target.value))}
                min="5"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={fetchRanking}
            disabled={loading}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? '取得中...' : '検索実行'}
          </button>
        </div>

        {/* 説明文 */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
          <p className="text-sm text-gray-700">
            ※更新日時から過去{days}日分のデータ（アイテム毎に最大{maxItems}件）を元に作成しています
          </p>
        </div>

        {/* ランキング見出し */}
        <h2 className="text-xl font-bold text-gray-800 mb-6">1位 ~ {topN}位</h2>

        {/* コンテンツ */}
        {loading && <LoadingSpinner />}
        {error && <ErrorMessage message={error} onRetry={fetchRanking} />}
        {!loading && !error && data.length > 0 && (
          <RankingTable data={data} metadata={metadata} />
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t border-gray-200 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>データ提供: <a href="https://universalis.app/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Universalis</a></p>
          {currentTime && <p className="mt-2">最終更新: {currentTime}</p>}
        </div>
      </footer>
    </div>
  );
}