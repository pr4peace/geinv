'use client'

import { useEffect, useState } from 'react'

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
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="w-24 h-24 bg-forest rounded-sm flex items-center justify-center shadow-2xl border border-hairline relative">
          <span className="text-paper font-serif font-bold text-4xl">G</span>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-earth-ochre rounded-sm border border-hairline" />
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-ink-1 tracking-tight font-serif">Good Earth</h1>
          <p className="lbl font-bold tracking-[0.3em] text-ink-5">Investments</p>
        </div>
      </div>
    </div>
  )
}
