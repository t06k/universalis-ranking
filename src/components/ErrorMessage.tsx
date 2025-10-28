// src/components/ErrorMessage.tsx
interface ErrorMessageProps {
    message: string;
    onRetry?: () => void;
}
export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
    return (
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg shadow-sm">
            <div className="flex items-start">
                <div className="flex-shrink-0">
                    <svg
                        className="h-6 w-6 text-red-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}

                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <div className="ml-3 flex-1">
                    <h3 className="text-lg font-medium text-red-800">
                        エラーが発生しました
                    </h3>
                    <p className="mt-2 text-sm text-red-700">{message}</p>
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                            再試行
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}