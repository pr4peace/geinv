import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="w-16 h-16 bg-surface-2 border border-hairline rounded-sm flex items-center justify-center mx-auto">
          <span className="text-2xl font-bold num text-ink-5">404</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-1 mb-2 font-serif">Page not found</h1>
          <p className="text-ink-4 text-sm font-medium">
            The page you are looking for does not exist, or you may not have access to it.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-block bg-forest hover:bg-forest-2 text-paper text-sm font-bold uppercase tracking-widest px-8 py-2.5 rounded-sm transition-all shadow-md active:scale-[0.98]"
        >
          Dashboard
        </Link>
      </div>
    </div>
  )
}
