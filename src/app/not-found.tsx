import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-2xl text-slate-400">404</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Page not found</h1>
          <p className="text-slate-400 text-sm">
            The page you are looking for does not exist, or you may not have access to it.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
