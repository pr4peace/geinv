import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { PayoutRow } from './payout-calculator'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a18' },
  header: { marginBottom: 24, borderBottom: '1pt solid #ccc', paddingBottom: 12 },
  org: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#2d4a2d', marginBottom: 2 },
  title: { fontSize: 11, color: '#888' },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 6, borderBottom: '0.5pt solid #eee', paddingBottom: 3 },
  row: { flexDirection: 'row', marginBottom: 4 },
  fieldLabel: { width: 140, color: '#888' },
  fieldValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f4f3f0', padding: '5 4', marginBottom: 1 },
  tableRow: { flexDirection: 'row', padding: '4 4', borderBottom: '0.5pt solid #f0f0ee' },
  tableFooter: { flexDirection: 'row', padding: '5 4', backgroundColor: '#f4f3f0', borderTop: '1pt solid #ccc', marginTop: 2 },
  col1: { width: 20 },
  col2: { flex: 2 },
  col3: { width: 36, textAlign: 'right' },
  col4: { width: 70, textAlign: 'right' },
  col5: { width: 60, textAlign: 'right' },
  col6: { width: 70, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888' },
  tdText: { fontSize: 9, color: '#555' },
  tdBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1a1a18' },
  footer: { marginTop: 24, paddingTop: 8, borderTop: '0.5pt solid #eee', fontSize: 8, color: '#bbb', textAlign: 'center' },
})

function fmt(n: number) {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export interface InfoSheetData {
  investor_name: string
  investor_pan: string
  agreement_type: string
  agreement_date: string
  principal_amount: number
  roi_percentage: number
  payout_frequency: string
  interest_type: string
  investment_start_date: string
  maturity_date: string
  lock_in_years: number
  schedule: PayoutRow[]
}

export function InfoSheetDocument({ data }: { data: InfoSheetData }) {
  const totalGross = data.schedule.reduce((s, r) => s + r.gross_interest, 0)
  const totalTds = data.schedule.reduce((s, r) => s + r.tds_amount, 0)
  const totalNet = data.schedule.reduce((s, r) => s + r.net_interest, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>Good Earth</Text>
          <Text style={styles.title}>Investment Information Sheet</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Investor</Text>
          <View style={styles.row}><Text style={styles.fieldLabel}>Name</Text><Text style={styles.fieldValue}>{data.investor_name}</Text></View>
          {data.investor_pan ? <View style={styles.row}><Text style={styles.fieldLabel}>PAN</Text><Text style={styles.fieldValue}>{data.investor_pan}</Text></View> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Agreement</Text>
          <View style={styles.row}><Text style={styles.fieldLabel}>Type</Text><Text style={styles.fieldValue}>{data.agreement_type || 'Investment Agreement'}</Text></View>
          {data.agreement_date ? <View style={styles.row}><Text style={styles.fieldLabel}>Date</Text><Text style={styles.fieldValue}>{fmtDate(data.agreement_date)}</Text></View> : null}
          {data.lock_in_years ? <View style={styles.row}><Text style={styles.fieldLabel}>Lock-in Period</Text><Text style={styles.fieldValue}>{data.lock_in_years} years</Text></View> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Investment Terms</Text>
          <View style={styles.row}><Text style={styles.fieldLabel}>Principal Amount</Text><Text style={styles.fieldValue}>{fmt(data.principal_amount)}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Rate of Interest</Text><Text style={styles.fieldValue}>{data.roi_percentage}% per annum</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Interest Type</Text><Text style={styles.fieldValue}>{data.interest_type === 'compound' ? 'Compound' : 'Simple'}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Payout Frequency</Text><Text style={styles.fieldValue}>{data.payout_frequency.charAt(0).toUpperCase() + data.payout_frequency.slice(1)}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Start Date</Text><Text style={styles.fieldValue}>{fmtDate(data.investment_start_date)}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Maturity Date</Text><Text style={styles.fieldValue}>{fmtDate(data.maturity_date)}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Payout Schedule</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.col1]}>#</Text>
            <Text style={[styles.thText, styles.col2]}>Period</Text>
            <Text style={[styles.thText, styles.col3]}>Days</Text>
            <Text style={[styles.thText, styles.col4]}>Gross</Text>
            <Text style={[styles.thText, styles.col5]}>TDS (10%)</Text>
            <Text style={[styles.thText, styles.col6]}>Net</Text>
          </View>
          {data.schedule.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tdText, styles.col1]}>{i + 1}</Text>
              <Text style={[styles.tdText, styles.col2]}>{fmtDate(row.period_from)} – {fmtDate(row.period_to)}</Text>
              <Text style={[styles.tdText, styles.col3]}>{row.no_of_days}</Text>
              <Text style={[styles.tdText, styles.col4]}>{fmt(row.gross_interest)}</Text>
              <Text style={[styles.tdText, styles.col5]}>{fmt(row.tds_amount)}</Text>
              <Text style={[styles.tdBold, styles.col6]}>{fmt(row.net_interest)}</Text>
            </View>
          ))}
          <View style={styles.tableFooter}>
            <Text style={[styles.thText, styles.col1]}></Text>
            <Text style={[styles.thText, styles.col2]}>Total</Text>
            <Text style={[styles.thText, styles.col3]}></Text>
            <Text style={[styles.thText, styles.col4]}>{fmt(totalGross)}</Text>
            <Text style={[styles.thText, styles.col5]}>{fmt(totalTds)}</Text>
            <Text style={[styles.thText, styles.col6]}>{fmt(totalNet)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>This is an indicative information sheet only and does not constitute a legally binding agreement. TDS deducted at 10% as per applicable regulations.</Text>
      </Page>
    </Document>
  )
}
