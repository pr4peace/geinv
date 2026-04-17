import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

export interface ExtractedPayoutRow {
  period_from: string        // ISO date
  period_to: string          // ISO date
  no_of_days: number | null
  due_by: string             // ISO date — the "on or before" date
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
}

export interface ExtractedAgreement {
  agreement_date: string           // ISO date
  investment_start_date: string    // ISO date — when money was received
  agreement_type: string
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  nominees: Array<{ name: string; pan: string }>
  tds_filing_name: string | null   // name under which TDS should be filed
  principal_amount: number
  roi_percentage: number
  payout_frequency: 'quarterly' | 'annual' | 'cumulative'
  interest_type: 'simple' | 'compound'
  lock_in_years: number
  maturity_date: string            // ISO date
  payment_date: string | null      // ISO date
  payment_mode: string | null
  payment_bank: string | null
  payout_schedule: ExtractedPayoutRow[]
  confidence_warnings?: string[]
}

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from Indian investment agreement documents.

Extract ALL fields exactly as they appear in the document. Follow these rules:

1. DATES: Always return dates in ISO format (YYYY-MM-DD). The agreement_date is the date the agreement was signed. The investment_start_date is when the money was actually received/paid (may differ from agreement_date — look at the payment table).

2. PAYOUT SCHEDULE: Extract EVERY row from the interest payout table. Each row has:
   - period_from and period_to (the interest accrual period)
   - no_of_days (number of days in that period)
   - due_by (the "on or before" date — this is when payment must be made)
   - gross_interest (interest before TDS)
   - tds_amount (tax deducted at source, typically 10%)
   - net_interest (gross_interest minus tds_amount)
   - is_principal_repayment: true ONLY for the final row if it represents principal return (see rule 9)

3. AMOUNTS: Return as plain numbers without commas or currency symbols (e.g., 10000000 not "1,00,00,000").

4. PAYOUT FREQUENCY:
   - "quarterly" if interest is paid every quarter
   - "annual" if interest is paid annually
   - "cumulative" if interest is paid at maturity only

5. INTEREST TYPE:
   - "compound" if principal grows each period
   - "simple" otherwise

6. NOMINEES: Extract name and PAN of all nominees listed.

7. If a field is not present in the document, return null.

8. TDS FILING NAME: Extract the name under which TDS is to be deducted/filed. This is typically the primary applicant's name. If the document explicitly states a TDS deductee name, use that. Otherwise default to the investor_name value.

9. PRINCIPAL REPAYMENT ROW: The final row in the payment table often contains the principal return. Mark is_principal_repayment: true ONLY if:
   - The row's gross_interest value equals or approximately equals the principal_amount, OR
   - The row label/description contains words like "Principal", "Maturity Amount", or "Repayment"
   Do NOT add extra rows beyond what appears in the document table. Do NOT mark a row as principal repayment if its amount matches a normal periodic interest payment.

Return ONLY valid JSON matching this exact schema — no explanation, no markdown fences:
{
  "agreement_date": "YYYY-MM-DD",
  "investment_start_date": "YYYY-MM-DD",
  "agreement_type": "string",
  "investor_name": "string",
  "investor_pan": "string or null",
  "investor_aadhaar": "string or null",
  "investor_address": "string or null",
  "nominees": [],
  "tds_filing_name": "string or null",
  "principal_amount": 0,
  "roi_percentage": 0,
  "payout_frequency": "quarterly|annual|cumulative",
  "interest_type": "simple|compound",
  "lock_in_years": 0,
  "maturity_date": "YYYY-MM-DD",
  "payment_date": "YYYY-MM-DD or null",
  "payment_mode": "string or null",
  "payment_bank": "string or null",
  "payout_schedule": [],
  "confidence_warnings": []
}`

export async function extractAgreementData(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  let result: Awaited<ReturnType<typeof model.generateContent>>

  try {
    if (mimeType === 'application/pdf') {
      result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        },
        EXTRACTION_PROMPT,
      ])
    } else {
      // DOCX — extract text via mammoth then send as text
      const mammoth = await import('mammoth')
      const extracted = await mammoth.extractRawText({ buffer: fileBuffer })
      result = await model.generateContent([
        `${EXTRACTION_PROMPT}\n\nDocument text:\n\n${extracted.value}`,
      ])
    }
  } catch (err) {
    throw new Error(`Gemini API call failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const text = result.response.text()

  // Strip markdown code fences if present
  const json = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`Gemini returned invalid JSON. Response: ${json.slice(0, 300)}`)
  }

  const data = parsed as ExtractedAgreement

  // Validate critical numeric fields
  const numericFields = ['principal_amount', 'roi_percentage', 'lock_in_years'] as const
  for (const field of numericFields) {
    if (typeof data[field] !== 'number') {
      throw new Error(`Extracted field '${field}' is not a number: ${JSON.stringify(data[field])}`)
    }
  }

  // Validate payout schedule
  if (!Array.isArray(data.payout_schedule)) {
    throw new Error('Extracted payout_schedule is not an array')
  }
  for (const row of data.payout_schedule) {
    for (const f of ['gross_interest', 'tds_amount', 'net_interest'] as const) {
      if (typeof row[f] !== 'number') {
        throw new Error(`Payout row field '${f}' is not a number: ${JSON.stringify(row[f])}`)
      }
    }
  }

  return data
}
