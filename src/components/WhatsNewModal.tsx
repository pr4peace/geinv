'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, AlertCircle, Star, Info } from 'lucide-react'
import { APP_VERSION, WHATS_NEW_CONTENT } from '@/lib/version'

const importanceConfig = {
  critical: { icon: AlertCircle, color: 'text-rust', bg: 'bg-rust-soft', border: 'border-rust/20' },
  high: { icon: Star, color: 'text-clay', bg: 'bg-clay-soft', border: 'border-clay/20' },
  medium: { icon: Info, color: 'text-ink-3', bg: 'bg-canvas', border: 'border-hairline-strong' },
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-1/40 backdrop-blur-[2px] animate-in fade-in duration-300">
      <div className="bg-surface border border-hairline rounded-sm shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col">
        {/* Header */}
        <div className="relative h-32 bg-forest flex items-center justify-center overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-paper rounded-full translate-x-16 translate-y-16 blur-3xl" />
          </div>
          <div className="relative flex flex-col items-center">
            <div className="bg-paper/10 p-3 rounded-sm backdrop-blur-md mb-2 border border-paper/20">
              <Sparkles className="w-7 h-7 text-paper" />
            </div>
            <h2 className="text-xl font-bold text-paper tracking-tight font-serif">What&apos;s New</h2>
            <p className="text-[10px] uppercase font-bold tracking-widest text-paper/60 mt-1">Version {APP_VERSION} · {WHATS_NEW_CONTENT.length} updates</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 text-paper/50 hover:text-paper transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex gap-4 px-6 pt-5 pb-3 flex-shrink-0 border-b border-hairline bg-canvas/50">
          {(['critical', 'high', 'medium'] as const).map(level => {
            const cfg = importanceConfig[level]
            return (
              <span key={level} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.color} border ${cfg.border} shadow-sm`}>
                <cfg.icon className="w-3 h-3" />
                {level}
              </span>
            )
          })}
        </div>

        {/* Content */}
        <div className="p-6 pt-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
          {WHATS_NEW_CONTENT.map((item, idx) => {
            const cfg = importanceConfig[item.importance]
            const Icon = cfg.icon
            return (
              <div
                key={idx}
                className={`flex gap-4 px-4 py-3 rounded-sm border ${cfg.bg} ${cfg.border} hover:bg-white hover:shadow-md transition-all group`}
              >
                <Icon className={`w-4 h-4 ${cfg.color} flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110`} />
                <div>
                  <p className="text-sm font-bold text-ink-1 leading-tight">{item.feature}</p>
                  <p className="text-[11px] text-ink-4 leading-relaxed mt-1 font-medium italic">{item.impact}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-6 bg-surface-2 border-t border-hairline flex-shrink-0">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full h-12 bg-forest hover:bg-forest-2 text-paper text-xs font-bold uppercase tracking-[0.2em] rounded-sm transition-all active:scale-[0.98] shadow-lg shadow-forest/10"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  )
}
