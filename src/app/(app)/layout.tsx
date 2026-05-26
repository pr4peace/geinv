'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Bell,
  FileText,
  Settings,
  LogOut,
  User,
} from 'lucide-react'
import { SplashScreen } from '@/components/SplashScreen'
import WhatsNewModal from '@/components/WhatsNewModal'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/agreements', label: 'Agreements', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({ email: data.user.email })
      }
    })
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getPageTitle = () => {
    const item = navItems.find(i => pathname.startsWith(i.href))
    return item ? item.label : 'App'
  }

  if (!isMounted) return <div className="h-screen bg-paper" />

  return (
    <>
      <SplashScreen />
      <WhatsNewModal />
      <div className="flex h-screen bg-canvas overflow-hidden font-sans">
        {/* Sidebar */}
        <aside className="hidden md:flex w-[224px] flex-shrink-0 bg-surface border-r border-hairline flex-col z-20">
          {/* Brand block */}
          <div className="h-[72px] flex items-center gap-3 px-6">
            <div className="w-7 h-7 bg-forest rounded-sm flex items-center justify-center flex-shrink-0 text-paper font-serif font-bold text-lg">
              G
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink-1 font-serif leading-tight">Good Earth</p>
              <p className="lbl leading-none mt-0.5">Investments</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            <p className="px-3 mb-2 lbl opacity-70">Main Menu</p>
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-ink-1 text-paper'
                      : 'text-ink-2 hover:bg-surface-2'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-paper' : 'text-ink-4'}`} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* User strip */}
          <div className="p-4 border-t border-hairline">
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-surface-2 border border-hairline">
              <div className="w-8 h-8 rounded-full bg-forest-soft flex items-center justify-center text-forest flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-ink-1 truncate">{user?.email?.split('@')[0] || 'User'}</p>
                <button
                  onClick={handleSignOut}
                  className="text-[10px] text-ink-4 hover:text-rust font-medium flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-2.5 h-2.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content wrapper */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-[52px] bg-surface border-b border-hairline flex items-center justify-between px-8 flex-shrink-0">
            <div className="flex items-center gap-2 text-ink-3 text-xs font-medium">
              <span className="opacity-50">App</span>
              <span className="text-hairline-strong">/</span>
              <span className="text-ink-2 font-semibold">{getPageTitle()}</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-ink-4 text-[11px] font-medium tracking-tight">
                <span>{format(new Date(), 'EEEE, d MMM yyyy')}</span>
                <div className="w-1.5 h-1.5 bg-gain rounded-full shadow-[0_0_0_3px_rgba(27,94,63,0.18)]" />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto bg-canvas">
            {children}
          </main>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E6E3DA;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D4D0C2;
        }
      `}</style>
    </>
  )
}
