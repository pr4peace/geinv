'use client'

import { useEffect, useState } from 'react'
import { Leaf } from 'lucide-react'

export function SplashScreen() {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('geinv_splash_shown')) return
    sessionStorage.setItem('geinv_splash_shown', '1')
    setVisible(true)
    const fadeTimer = setTimeout(() => setFading(true), 1200)
    const hideTimer = setTimeout(() => setVisible(false), 1700)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-900/40 border border-emerald-500/20">
          <Leaf className="w-10 h-10 text-white" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">Good Earth</h1>
          <p className="text-sm text-slate-500 font-medium">Investment Tracker</p>
        </div>
      </div>
    </div>
  )
}
