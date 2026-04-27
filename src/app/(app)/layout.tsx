'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Calendar,
  BarChart3,
  FileBarChart,
  Settings,
  Leaf,
  Users,
} from 'lucide-react'
import { SplashScreen } from '@/components/SplashScreen'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agreements', label: 'Agreements', icon: FileText },
  { href: '/investors', label: 'Investors', icon: Users },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/quarterly-review', label: 'Quarterly Review', icon: BarChart3 },
  { href: '/quarterly-reports', label: 'Reports', icon: FileBarChart },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <>
      <SplashScreen />
      <div className="flex h-screen bg-slate-950 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-800">
            <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Good Earth</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-slate-500 leading-tight">Investments</p>
                <p className="text-[10px] text-slate-700 leading-tight mt-0.5">v0.1.0</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-3 pb-4">
            <div className="px-3 py-2 text-xs text-slate-600">
              &copy; {new Date().getFullYear()} Good Earth
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </>
  )
}
