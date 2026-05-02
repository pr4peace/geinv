
export const APP_VERSION = 'D.2'

interface WhatsNewItem {
  feature: string
  impact: string
  importance: 'critical' | 'high' | 'medium'
}

export const WHATS_NEW_CONTENT: WhatsNewItem[] = [
  { feature: 'Claude Sonnet 4 extraction', impact: '4-5% better accuracy on FD receipts — fewer digit errors', importance: 'critical' },
  { feature: 'Per-field confidence scoring', impact: 'Catches hallucinated amounts, PANs, dates before they hit the DB', importance: 'critical' },
  { feature: 'Unified Payout + TDS table', impact: 'One chronological view — no more cross-referencing 3 separate sections', importance: 'critical' },
  { feature: 'FY subtotals & grand totals', impact: 'Instant TDS liability per financial year at a glance', importance: 'high' },
  { feature: 'Unified Reminders & Notifications', impact: 'Shows ALL reminders + notification queue entries (TDS, doc return) in one timeline', importance: 'critical' },
  { feature: 'Overdue row highlighting', impact: 'Red-left-border on past-due payouts — impossible to miss', importance: 'high' },
  { feature: 'TDS + Maturity amounts in emails', impact: 'Batch emails now group by type with subtotals + maturity principal shown', importance: 'high' },
  { feature: 'Batch rescan tool', impact: 'Rescan up to 20 agreements in parallel with diff cards and bulk apply', importance: 'high' },
  { feature: 'Rescan recommended banner', impact: 'Auto-shown on agreements uploaded with older extraction model', importance: 'medium' },
  { feature: 'Rescan filtered to rescan_required only', impact: 'No more scanning clean agreements — saves API costs and time', importance: 'medium' },
  { feature: 'PAN/Aadhaar regex validation', impact: 'Catches misread IDs immediately (e.g. "AB1234" flagged as invalid)', importance: 'high' },
  { feature: 'Native PDF input (Claude)', impact: 'Claude reads PDFs with full structure — no more binary thresholding destroying stamps', importance: 'high' },
  { feature: 'Auto-fallback to Gemini', impact: 'If Claude fails, Gemini picks up automatically — zero downtime', importance: 'medium' },
  { feature: 'Cascading notification filters', impact: 'When / Type / Who chips — no more dropdowns, faster filtering on mobile', importance: 'medium' },
  { feature: 'Date presets (7/14/30d, Month, Quarter, FY)', impact: 'One-click date ranges instead of manual pickers', importance: 'medium' },
]
