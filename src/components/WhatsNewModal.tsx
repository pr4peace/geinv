'use client'

import { useState, useEffect } from 'react'
import { X, CheckCircle2, Sparkles } from 'lucide-react'

const WHATS_NEW_VERSION = 'v1'
const MAX_VIEWS = 3

const NEW_FEATURES = [
  {
    title: 'Gemini AI Upgraded',
    description: 'Extraction is now faster and more accurate with the latest gemini-2.5-flash model.'
  },
  {
    title: 'New Payout Frequencies',
    description: 'Full support for Monthly and Biannual (6-monthly) interest payouts.'
  },
  {
    title: 'Historical Agreement Support',
    description: 'Mark all past payouts as paid with one click on the agreement detail or during import.'
  },
  {
    title: 'Document Re-scanning',
    description: 'Re-run AI extraction on existing documents without needing to re-upload files.'
  },
  {
    title: 'TDS Auto-Generation',
    description: 'Cumulative agreements now automatically generate TDS tracking rows for every March 31st.'
  },
  {
    title: 'Dashboard Improvements',
    description: 'Overdue payouts are now correctly surfaced; extraction can be cancelled mid-way.'
  }
]

export default function WhatsNewModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const sessionKey = `geinv_whats_new_${WHATS_NEW_VERSION}_session`
    if (sessionStorage.getItem(sessionKey)) return

    const key = `geinv_whats_new_${WHATS_NEW_VERSION}_count`
    const viewCount = parseInt(localStorage.getItem(key) || '0', 10)

    if (viewCount < MAX_VIEWS) {
      sessionStorage.setItem(sessionKey, '1')
      localStorage.setItem(key, (viewCount + 1).toString())
      setIsOpen(true)
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="relative h-32 bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="inline-flex p-2 bg-white/10 rounded-full mb-2">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">What&apos;s New in GoodEarth</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {NEW_FEATURES.map((item, i) => (
              <div key={i} className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-colors border border-slate-700"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  )
}
