import * as XLSX from 'xlsx'
import type { Agreement, PayoutSchedule } from '@/types/database'
import type { ReconciliationResult, ReconciliationEntry } from '@/types/database'
import { parseISO, isWithinInterval } from 'date-fns'

export interface IncomingPayment {
  party_name: string
  amount: number
  date: string
  mode?: string
}

export interface TDSEntry {
  investor_name: string
  pan: string
  interest_paid: number
  tds_deducted: number
}

export function parseExcelBuffer(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'buffer', cellDates: true })
}

export function parseIncomingFundsExcel(buffer: Buffer): IncomingPayment[] {
  const wb = parseExcelBuffer(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  return rows
    .filter(row => {
      const amount = Number(row['Amount'] ?? row['amount'] ?? row['Credit'] ?? row['credit'] ?? 0)
      return amount > 0
    })
    .map(row => ({
      party_name: String(row['Party Name'] ?? row['party_name'] ?? row['Name'] ?? row['name'] ?? '').trim(),
      amount: Number(row['Amount'] ?? row['amount'] ?? row['Credit'] ?? row['credit'] ?? 0),
      date: String(row['Date'] ?? row['date'] ?? ''),
      mode: String(row['Mode'] ?? row['mode'] ?? row['Payment Mode'] ?? '').trim(),
    }))
    .filter(p => p.party_name && p.amount > 0)
}

export function parseTDSExcel(buffer: Buffer): TDSEntry[] {
  const wb = parseExcelBuffer(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  return rows
    .map(row => ({
      investor_name: String(row['Name'] ?? row['Party Name'] ?? row['Deductee Name'] ?? '').trim(),
      pan: String(row['PAN'] ?? row['pan'] ?? row['PAN No'] ?? '').trim().toUpperCase(),
      interest_paid: Number(row['Interest'] ?? row['Amount Paid'] ?? row['Gross Amount'] ?? 0),
      tds_deducted: Number(row['TDS'] ?? row['Tax Deducted'] ?? row['TDS Amount'] ?? 0),
    }))
    .filter(e => e.investor_name && e.pan && e.interest_paid > 0)
}

export function reconcileIncomingFunds(
  payments: IncomingPayment[],
  agreements: Agreement[],
  quarterStart?: Date,
  quarterEnd?: Date
): ReconciliationResult {
  const matched: ReconciliationEntry[] = []
  const missing: ReconciliationEntry[] = []  // in system, not in Tally
  const extra: ReconciliationEntry[] = []    // in Tally, not in system
  const mismatched: ReconciliationEntry[] = []

  const filteredAgreements = (quarterStart && quarterEnd)
    ? agreements.filter(a => {
        const startDate = parseISO(a.investment_start_date)
        return isWithinInterval(startDate, { start: quarterStart, end: quarterEnd })
      })
    : agreements

  const usedPaymentIndices = new Set<number>()

  for (const agreement of filteredAgreements) {
    const principal = agreement.principal_amount
    const investorName = agreement.investor_name.toLowerCase()

    // Find matching payment: name similarity + amount within ₹100 + date ±7 days
    const matchIdx = payments.findIndex((p, i) => {
      if (usedPaymentIndices.has(i)) return false
      const nameMatch = p.party_name.toLowerCase().includes(investorName.split(' ')[0]) ||
        investorName.includes(p.party_name.toLowerCase().split(' ')[0])
      const amountMatch = Math.abs(p.amount - principal) <= 100
      // Date match: ±7 days from investment_start_date (if date available)
      let dateMatch = true
      if (p.date && agreement.investment_start_date) {
        try {
          const paymentDate = new Date(p.date)
          const investmentDate = parseISO(agreement.investment_start_date)
          const diffDays = Math.abs((paymentDate.getTime() - investmentDate.getTime()) / (1000 * 60 * 60 * 24))
          dateMatch = diffDays <= 7
        } catch { dateMatch = true } // if date parsing fails, don't filter on date
      }
      return nameMatch && amountMatch && dateMatch
    })

    if (matchIdx === -1) {
      missing.push({
        investor_name: agreement.investor_name,
        system_amount: principal,
        notes: `Agreement ${agreement.reference_id} found in system but no matching payment in Tally`,
      })
    } else {
      usedPaymentIndices.add(matchIdx)
      const payment = payments[matchIdx]
      if (Math.abs(payment.amount - principal) > 1) {
        mismatched.push({
          investor_name: agreement.investor_name,
          system_amount: principal,
          external_amount: payment.amount,
          notes: `Amount differs by ₹${Math.abs(payment.amount - principal).toLocaleString('en-IN')}`,
        })
      } else {
        matched.push({
          investor_name: agreement.investor_name,
          system_amount: principal,
          external_amount: payment.amount,
        })
      }
    }
  }

  // Remaining payments not matched to any agreement
  payments.forEach((p, i) => {
    if (!usedPaymentIndices.has(i)) {
      extra.push({
        investor_name: p.party_name,
        external_amount: p.amount,
        notes: 'Payment in Tally but no matching agreement found in system',
      })
    }
  })

  return { matched, missing, extra, mismatched }
}

export function reconcileTDS(
  tdsEntries: TDSEntry[],
  payouts: PayoutSchedule[],
  agreements: Agreement[],
  quarterStart: Date,
  quarterEnd: Date
): ReconciliationResult {
  const matched: ReconciliationEntry[] = []
  const missing: ReconciliationEntry[] = []
  const extra: ReconciliationEntry[] = []
  const mismatched: ReconciliationEntry[] = []

  // Filter payouts to this quarter (paid status)
  const quarterPayouts = payouts.filter(p => {
    if (p.status !== 'paid' || !p.paid_date) return false
    const paidDate = parseISO(p.paid_date)
    return isWithinInterval(paidDate, { start: quarterStart, end: quarterEnd })
  })

  const usedTDSIndices = new Set<number>()

  for (const payout of quarterPayouts) {
    const agreement = agreements.find(a => a.id === payout.agreement_id)
    if (!agreement || !agreement.investor_pan) continue

    const pan = agreement.investor_pan.toUpperCase()
    const matchIdx = tdsEntries.findIndex((e, i) => {
      if (usedTDSIndices.has(i)) return false
      return e.pan === pan
    })

    if (matchIdx === -1) {
      missing.push({
        investor_name: agreement.investor_name,
        pan,
        system_amount: payout.tds_amount,
        notes: 'Payout in system but not found in TDS sheet',
      })
    } else {
      usedTDSIndices.add(matchIdx)
      const entry = tdsEntries[matchIdx]
      if (Math.abs(entry.tds_deducted - payout.tds_amount) > 1) {
        mismatched.push({
          investor_name: agreement.investor_name,
          pan,
          system_amount: payout.tds_amount,
          external_amount: entry.tds_deducted,
          notes: `TDS differs by ₹${Math.abs(entry.tds_deducted - payout.tds_amount).toLocaleString('en-IN')}`,
        })
      } else {
        matched.push({
          investor_name: agreement.investor_name,
          pan,
          system_amount: payout.tds_amount,
          external_amount: entry.tds_deducted,
        })
      }
    }
  }

  tdsEntries.forEach((e, i) => {
    if (!usedTDSIndices.has(i)) {
      extra.push({
        investor_name: e.investor_name,
        pan: e.pan,
        external_amount: e.tds_deducted,
        notes: 'In TDS sheet but no matching paid payout found in system',
      })
    }
  })

  return { matched, missing, extra, mismatched }
}
