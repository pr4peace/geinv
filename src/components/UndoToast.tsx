// src/components/UndoToast.tsx
'use client'
import { useEffect, useState } from 'react'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
  durationMs?: number
}

export function UndoToast({ message, onUndo, onDismiss, durationMs = 5000 }: UndoToastProps) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100)
      setProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onDismiss()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [durationMs, onDismiss])

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-72 animate-in slide-in-from-bottom-4 duration-300">
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <span className="text-sm text-slate-200">{message}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
          >
            Undo
          </button>
          <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-slate-700">
        <div
          className="h-full bg-indigo-500 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
