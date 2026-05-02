
'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, AlertCircle, Star, Info } from 'lucide-react'
import { APP_VERSION, WHATS_NEW_CONTENT } from '@/lib/version'

const importanceConfig = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-800/50' },
  high: { icon: Star, color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-800/50' },
  medium: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-800/50' },
}

export default function WhatsNewModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const storageKey = `whats_new_seen_${APP_VERSION}`
    const seenCount = parseInt(localStorage.getItem(storageKey) || '0', 10)
    if (seenCount < 3) {
      setIsOpen(true)
      localStorage.setItem(storageKey, (seenCount + 1).toString())
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col">
        {/* Header */}
        <div className="relative h-28 bg-indigo-600 flex items-center justify-center overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-indigo-400 rounded-full translate-x-16 translate-y-16 blur-3xl" />
          </div>
          <div className="relative flex flex-col items-center">
            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-md mb-1.5">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">What&apos;s New in {APP_VERSION}</h2>
            <p className="text-xs text-indigo-200/80">{WHATS_NEW_CONTENT.length} improvements</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex gap-3 px-5 pt-3 pb-2 flex-shrink-0">
          {(['critical', 'high', 'medium'] as const).map(level => {
            const cfg = importanceConfig[level]
            return (
              <span key={level} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                <cfg.icon className="w-3 h-3" />
                {level}
              </span>
            )
          })}
        </div>

        {/* Content */}
        <div className="p-5 pt-2 overflow-y-auto flex-1 space-y-2">
          {WHATS_NEW_CONTENT.map((item, idx) => {
            const cfg = importanceConfig[item.importance]
            const Icon = cfg.icon
            return (
              <div
                key={idx}
                className={`flex gap-3 px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border} hover:bg-slate-800/50 transition-colors`}
              >
                <Icon className={`w-4 h-4 ${cfg.color} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className="text-sm font-semibold text-slate-100">{item.feature}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.impact}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex-shrink-0">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
