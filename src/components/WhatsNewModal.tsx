
'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, CheckCircle2 } from 'lucide-react'
import { APP_VERSION, WHATS_NEW_CONTENT } from '@/lib/version'

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
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="relative h-32 bg-indigo-600 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-indigo-400 rounded-full translate-x-16 translate-y-16 blur-3xl" />
          </div>
          <div className="relative flex flex-col items-center">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md mb-2">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">What&apos;s New in {APP_VERSION}</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <ul className="space-y-3">
            {WHATS_NEW_CONTENT.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300 leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex justify-center">
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
