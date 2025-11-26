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

// ワールドデータ定義
const WORLDS_BY_DC = {
  'Elemental': [
    { id: 23, name: 'Tonberry' },
    { id: 45, name: 'Carbuncle' },
    { id: 49, name: 'Kujata' },
    { id: 28, name: 'Aegis' },
    { id: 29, name: 'Atomos' },
    { id: 30, name: 'Garuda' },
    { id: 31, name: 'Gungnir' },
    { id: 32, name: 'Ramuh' },
    { id: 33, name: 'Tiamat' }
  ],
  'Gaia': [
    { id: 49, name: 'Alexander' },
    { id: 68, name: 'Typhon' },
    { id: 34, name: 'Bahamut' },
    { id: 35, name: 'Durandal' },
    { id: 36, name: 'Fenrir' },
    { id: 37, name: 'Ifrit' },
    { id: 38, name: 'Ridill' },
    { id: 40, name: 'Ultima' }
  ],
  'Mana': [
    { id: 44, name: 'Anima' },
    { id: 47, name: 'Hades' },
    { id: 48, name: 'Ixion' },
    { id: 70, name: 'Chocobo' },
    { id: 41, name: 'Asura' },
    { id: 43, name: 'Pandaemonium' },
    { id: 46, name: 'Masamune' },
    { id: 50, name: 'Titan' }
  ],
  'Meteor': [
    { id: 51, name: 'Shinryu' },
    { id: 52, name: 'Unicorn' },
    { id: 53, name: 'Yojimbo' },
    { id: 54, name: 'Zeromus' },
    { id: 55, name: 'Valefor' },
    { id: 56, name: 'Mandragora' },
    { id: 42, name: 'Belias' }
  ]
};

// ワールドデータ定義
const SORT_OPTIONS = [
  { id: "value", name: '取引額' },
  { id: "price", name: '平均単価' },
  { id: "sales", name: '販売数' }
];

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RankingItem[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [retainerCheck, setRetainerCheck] = useState(true); // デフォルトをONにする場合
  const [days, setDays] = useState(5);
  const [minSales, setMinSales] = useState(10);
  const [topN, setTopN] = useState(30);
  const [worldId, setWorldId] = useState(48);   // ワールドIDのstate追加
  const [sortBy, setSortBy] = useState("value");

  const fetchRanking = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: days.toString(),
        minSales: minSales.toString(),
        top: topN.toString(),
        retainer_check: retainerCheck.toString(), // APIにチェックボックスの状態を渡す
        worldId: worldId.toString(), //APIに選択されたworldsの情報を渡す
        sortBy: sortBy
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
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            マケボランキング
          </h1>
          <p className="text-gray-600">
            FF14 マーケット分析アプリ
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            検索条件
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* ワールド選択ドロップダウン */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ワールド
              </label>
              <select
                value={worldId}
                onChange={(e) => setWorldId(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                {Object.entries(WORLDS_BY_DC).map(([dc, worlds]) => (
                  <optgroup key={dc} label={dc}>
                    {worlds.map((world) => (
                      <option key={world.id} value={world.id}>
                        {world.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                並び替え
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                {SORT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* リテイナー取得アイテムに絞るチェックボックス */}
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={retainerCheck}
                onChange={(e) => setRetainerCheck(e.target.checked)}
                className="rounded border-gray-400 text-blue-600 focus:ring-blue-500"
              />
              リテイナー取得アイテムのみを対象にする
            </label>
          </div>

          <button
            onClick={fetchRanking}
            disabled={loading}
            className="mt-4 w-full md:w-auto px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '取得中...' : '検索実行'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {loading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} onRetry={fetchRanking} />}
          {!loading && !error && data.length > 0 && (
            <RankingTable data={data} metadata={metadata} />
          )}
        </div>

        <footer className="mt-8 text-center text-sm text-gray-600">
          <p>
            データ:{' '}
            <a
              href="https://universalis.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Universalis
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}