export type TeamMemberRole = 'coordinator' | 'accountant' | 'financial_analyst' | 'salesperson' | 'admin'
export type AgreementStatus = 'active' | 'matured' | 'cancelled' | 'combined'
export type PayoutFrequency = 'quarterly' | 'annual' | 'cumulative' | 'monthly' | 'biannual'
export type InterestType = 'simple' | 'compound'
export type DocStatus = 'draft' | 'partner_signed' | 'sent_to_client' | 'returned' | 'uploaded'
export type PayoutStatus = 'pending' | 'notified' | 'paid' | 'overdue'
export type ReminderType = 'payout' | 'maturity' | 'doc_return' | 'quarterly_forecast' | 'payout_monthly_summary'
export type ReminderStatus = 'pending' | 'sent' | 'failed'

export interface PaymentEntry {
  date: string | null
  mode: string | null
  bank: string | null
  amount: number | null
}

export interface Investor {
  id: string
  name: string
  pan: string | null
  aadhaar: string | null
  address: string | null
  birth_year: number | null
  payout_bank_name: string | null
  payout_bank_account: string | null
  payout_bank_ifsc: string | null
  created_at: string
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamMemberRole
  is_active: boolean
  created_at: string
}

export interface Agreement {
  id: string
  reference_id: string
  agreement_date: string
  investment_start_date: string
  agreement_type: string
  document_url: string | null
  is_draft: boolean
  status: AgreementStatus
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  investor_relationship: string | null
  investor_parent_name: string | null
  nominees: Array<{ name: string; relationship?: string; share?: number; pan?: string }>
  principal_amount: number
  roi_percentage: number
  payout_frequency: PayoutFrequency
  interest_type: InterestType
  lock_in_years: number
  maturity_date: string
  payments: PaymentEntry[]
  salesperson_id: string | null
  salesperson_custom: string | null
  tds_filing_name: string | null
  doc_status: DocStatus
  doc_sent_to_client_date: string | null
  doc_returned_date: string | null
  doc_return_reminder_days: number
  investor_id: string | null
  investor_birth_year: number | null
  investor2_name: string | null
  investor2_pan: string | null
  investor2_aadhaar: string | null
  investor2_address: string | null
  investor2_birth_year: number | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Joined
  salesperson?: TeamMember
  investor?: Investor
}

export interface PayoutSchedule {
  id: string
  agreement_id: string
  period_from: string
  period_to: string
  no_of_days: number | null
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
  status: PayoutStatus
  paid_date: string | null
  is_tds_only: boolean
  tds_filed: boolean
  created_at: string
  // Joined
  agreement?: Agreement
}

export interface Reminder {
  id: string
  agreement_id: string | null
  payout_schedule_id: string | null
  reminder_type: ReminderType
  lead_days: number | null
  scheduled_at: string
  status: ReminderStatus
  sent_at: string | null
  email_to: string[]
  email_subject: string | null
  email_body: string | null
  created_at: string
}

export interface QuarterlyReview {
  id: string
  quarter: string
  quarter_start: string
  quarter_end: string
  incoming_funds_doc_url: string | null
  incoming_funds_status: 'pending' | 'completed'
  incoming_funds_result: ReconciliationResult | null
  tds_doc_url: string | null
  tds_status: 'pending' | 'completed'
  tds_result: ReconciliationResult | null
  created_at: string
}

export interface ReconciliationResult {
  matched: ReconciliationEntry[]
  missing: ReconciliationEntry[]
  extra: ReconciliationEntry[]
  mismatched: ReconciliationEntry[]
}

export interface ReconciliationEntry {
  investor_name: string
  pan?: string
  system_amount?: number
  external_amount?: number
  due_by?: string
  notes?: string
}

export type NotificationType =
  | 'payout'
  | 'maturity'
  | 'tds_filing'
  | 'doc_return'
  | 'monthly_summary'
  | 'quarterly_forecast'

export type NotificationStatus = 'pending' | 'sent' | 'dismissed'

export interface NotificationQueue {
  id: string
  agreement_id: string | null
  payout_schedule_id: string | null
  notification_type: NotificationType
  due_date: string | null       // ISO date
  status: NotificationStatus
  recipients: {
    accounts: string[]
    salesperson: string | null
  }
  suggested_subject: string | null
  suggested_body: string | null
  sent_at: string | null
  sent_by: string | null
  created_at: string
}
