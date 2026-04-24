import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import type { DocReturnRow } from '@/lib/dashboard-reminders'

interface Props {
  docs: DocReturnRow[]
}

export default function DocReturnSection({ docs }: Props) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-sm font-bold text-slate-100">Docs Pending Return</h2>
        {docs.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-orange-900/60 text-orange-300 text-xs font-semibold">
            {docs.length} agreement{docs.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No documents pending return.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => (
            <Link
              key={doc.id}
              href={`/agreements/${doc.id}`}
              className="block bg-slate-800/60 border border-slate-700 border-l-4 border-l-orange-500 rounded-lg p-3 sm:p-4 hover:bg-slate-700/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{doc.investor_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sent {format(parseISO(doc.doc_sent_to_client_date), 'dd MMM yyyy')} · {doc.reference_id}
                  </p>
                  <p className={`text-xs mt-0.5 ${doc.isOverdue ? 'text-orange-400' : 'text-slate-500'}`}>
                    {doc.daysSinceSent} day{doc.daysSinceSent !== 1 ? 's' : ''} ago
                  </p>
                </div>
                <div className="shrink-0">
                  {doc.isOverdue ? (
                    <span className="bg-orange-900/60 text-orange-300 text-xs px-2 py-1 rounded font-semibold">
                      Overdue
                    </span>
                  ) : (
                    <span className="border border-slate-600 text-slate-400 text-xs px-2 py-1 rounded">
                      Waiting
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
