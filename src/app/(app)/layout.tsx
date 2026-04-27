'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Calendar,
  BarChart3,
  FileBarChart,
  Settings,
  Leaf,
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Loader2,
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

interface SearchResult {
  id: string
  type: 'agreement' | 'investor'
  title: string
  subtitle: string
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  
  // Sidebar state
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Persist sidebar state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('sidebar-collapsed', String(isCollapsed))
    }
  }, [isCollapsed, isMounted])

  // Handle global click and Escape key to close search results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
    }
    
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowSearchResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Search logic
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    const controller = new AbortController()
    
    const timer = setTimeout(async () => {
      setIsSearching(true)
      setShowSearchResults(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal
        })
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Search failed:', err)
        }
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery])

  const handleResultClick = (result: SearchResult) => {
    setShowSearchResults(false)
    setSearchQuery('')
    const path = result.type === 'agreement' ? `/agreements/${result.id}` : `/investors/${result.id}`
    router.push(path)
  }

  if (!isMounted) return <div className="h-screen bg-slate-950" />

  return (
    <>
      <SplashScreen />
      <div className="flex h-screen bg-slate-950 overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={`relative flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out ${
            isCollapsed ? 'w-20' : 'w-64'
          }`}
        >
          {/* Logo */}
          <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 overflow-hidden">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/20">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">Good Earth</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Investments</p>
                  <p className="text-[10px] text-slate-700 font-mono mt-0.5">v0.1.0</p>
                </div>
              </div>
            )}
          </div>

          {/* Search Section */}
          <div className="px-4 py-4 relative" ref={searchRef}>
            <div className={`relative group ${isCollapsed ? 'flex justify-center' : ''}`}>
              {isCollapsed ? (
                <button 
                  onClick={() => setIsCollapsed(false)}
                  className="p-2.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-700/50"
                  title="Search (click to expand)"
                >
                  <Search className="w-5 h-5" />
                </button>
              ) : (
                <>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    )}
                  </div>
                  <input
                    type="text"
                    className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 text-xs rounded-xl py-2.5 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                    placeholder="Search agreements, investors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchQuery.trim().length >= 2 && setShowSearchResults(true)}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}

              {/* Search Results Overlay */}
              {!isCollapsed && showSearchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-40 overflow-hidden max-h-[400px] flex flex-col">
                  <div className="p-2 border-b border-slate-700/50 bg-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">
                      {searchResults.length > 0 ? 'Search Results' : isSearching ? 'Searching...' : 'No results found'}
                    </p>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar">
                    {searchResults.map((result) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleResultClick(result)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-700/50 flex items-center gap-3 transition-colors group border-b border-slate-700/30 last:border-0"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          result.type === 'agreement' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {result.type === 'agreement' ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{result.title}</p>
                          <p className="text-[10px] text-slate-500 truncate">{result.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="p-2 bg-slate-900/30 text-center border-t border-slate-700/50">
                      <p className="text-[9px] text-slate-600 font-medium italic">Press Esc to close</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <div key={href} className="relative group">
                  <Link
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 ring-1 ring-white/10'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    } ${isCollapsed ? 'justify-center px-0' : ''}`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                    {!isCollapsed && <span>{label}</span>}
                  </Link>
                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-2xl border border-slate-700 ring-1 ring-white/5">
                      {label}
                      {/* Arrow */}
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-slate-800" />
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Collapse Toggle */}
          <div className="p-4 border-t border-slate-800">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700/50 ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
            >
              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : (
                <>
                  <ChevronLeft className="w-5 h-5" />
                  <span>Collapse Sidebar</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-slate-950 flex flex-col">
          {children}
        </main>
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}</style>
    </>
  )
}
