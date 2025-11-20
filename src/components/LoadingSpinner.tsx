// src/components/LoadingSpinner.tsx
export default function LoadingSpinner() {
    return (
        <div className="flex flex-col items-center justify-center py-12">
            <div className="relative w-16 h-16">
                <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
                <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="mt-4 text-gray-600 font-medium">
                データを取得中...
            </p>
            <p className="mt-2 text-sm text-gray-500">
                最大20秒ほどかかる場合があります
            </p>
        </div>
    );
}