'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="w-16 h-16 bg-red-900/30 border border-red-800 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-2xl text-red-400">!</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Something went wrong</h1>
          <p className="text-slate-400 text-sm">
            An unexpected error occurred. Please try again or return to the dashboard.
          </p>
          {process.env.NODE_ENV === 'development' && error.message && (
            <pre className="mt-4 text-left bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-red-400 overflow-auto">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
