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
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="w-16 h-16 bg-rust-soft border border-hairline rounded-sm flex items-center justify-center mx-auto">
          <span className="text-2xl text-rust">!</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-1 mb-2 font-serif">Something went wrong</h1>
          <p className="text-ink-4 text-sm font-medium">
            An unexpected error occurred. Please try again or return to the dashboard.
          </p>
          {process.env.NODE_ENV === 'development' && error.message && (
            <pre className="mt-4 text-left bg-surface border border-hairline rounded-sm p-4 text-[11px] font-mono text-rust overflow-auto whitespace-pre-wrap">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-forest hover:bg-forest-2 text-paper text-sm font-bold uppercase tracking-wider px-6 py-2 rounded-sm transition-all shadow-sm"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="bg-surface-2 hover:bg-surface-3 text-ink-2 text-sm font-bold uppercase tracking-wider px-6 py-2 rounded-sm transition-all border border-hairline shadow-sm"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
