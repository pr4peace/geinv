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
    <div className="fixed bottom-8 right-8 z-[200] bg-surface border border-hairline-strong rounded-sm shadow-2xl overflow-hidden min-w-[320px] animate-in slide-in-from-right-4 duration-500">
      <div className="px-6 py-4 flex items-center justify-between gap-6">
        <span className="text-[13px] font-bold text-ink-1">{message}</span>
        <div className="flex items-center gap-4">
          <button
            onClick={onUndo}
            className="text-[11px] font-bold uppercase tracking-widest text-forest hover:text-forest-2 transition-colors whitespace-nowrap"
          >
            Undo
          </button>
          <button 
            onClick={onDismiss} 
            className="text-ink-5 hover:text-ink-2 transition-colors"
            aria-label="Dismiss"
          >
            <span className="text-xs">✕</span>
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-hairline-strong">
        <div
          className="h-full bg-forest transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
