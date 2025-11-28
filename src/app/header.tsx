import Link from 'next/link';

export default function Header() {
    return (
        <header className="mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
                <Link href="/">
                    マケボランキング
                </Link>
            </h1>
            <p className="text-gray-600">
                FF14 マーケット分析アプリ
            </p>
        </header>
    );
}