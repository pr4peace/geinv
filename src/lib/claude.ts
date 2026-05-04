import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

export interface ExtractedPayoutRow {
  period_from: string        // ISO date
  period_to: string          // ISO date
  no_of_days: number | null
  due_by: string             // ISO date
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
  is_tds_only: boolean
}

export interface ExtractedAgreement {
  agreement_date: string           // ISO date
  investment_start_date: string    // ISO date
  agreement_type: string
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  nominees: Array<{ name: string; pan: string }>
  tds_filing_name: string | null
  principal_amount: number
  roi_percentage: number
  payout_frequency: 'quarterly' | 'annual' | 'cumulative' | 'monthly' | 'biannual'
  interest_type: 'simple' | 'compound'
  lock_in_years: number
  maturity_date: string            // ISO date
  is_draft: boolean
  payments: Array<{ date: string | null; mode: string | null; bank: string | null; amount: number | null }>
  payout_schedule: ExtractedPayoutRow[]
  confidence_warnings?: string[]
  confidence?: Record<string, number>
}

const EXTRACTION_PROMPT = `You are extracting data from an Indian Investment Agreement. Focus on getting these 5 things exactly right — everything else is secondary.

━━━ CRITICAL FIELD 1: PRINCIPAL AMOUNT ━━━
Indian number system:
  1 Lakh    = 1,00,000      (6 digits)
  10 Lakhs  = 10,00,000     (7 digits)
  1 Crore   = 1,00,00,000   (8 digits)
  10 Crores = 10,00,00,000  (9 digits)

Indian agreements ALWAYS state the principal in BOTH words and digits. Use both to cross-verify:
- STEP 1 — WORDS: Find the words (e.g. "Rupees One Crore Only"). Convert to a number: "One Crore" = 10000000.
- STEP 2 — DIGITS: Count the digits in the numeral. "1,00,00,000" has 8 digits → 1 crore = 10000000. ✓ Matches words.
- STEP 3 — If words and digits disagree, TRUST THE WORDS. Never add or remove a zero.
- Return as a plain integer, no commas, no ₹ symbol.

━━━ CRITICAL FIELD 2: PAYMENT DATES (payout_schedule) ━━━
The document will have a table of scheduled interest payments. Extract every row.
The table columns are typically labelled "Payable From" and "Payable To":
- period_from: the "Payable From" date
- period_to: the "Payable To" date
- due_by: MUST equal period_to exactly — the "Payable To" date IS the notification/due date. Do NOT use any "On or before" text; ignore it entirely.
- gross_interest: interest before TDS
- tds_amount: TDS deducted (always 10% of gross)
- net_interest: gross minus TDS
- is_principal_repayment: true only for the final principal repayment row
- is_tds_only: true if this row is a standalone TDS payment row

━━━ CRITICAL FIELD 3: MATURITY DATE ━━━
Look for: "Maturity Date", "Date of Maturity", "due for repayment on", "lock-in ends".
Convert from DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD. Do NOT return null if it appears in the document.

━━━ CRITICAL FIELD 4: PAYOUT FREQUENCY ━━━
One of: "monthly", "quarterly", "biannual" (every 6 months), "annual", "cumulative" (paid at maturity).
Look for: "interest payable", "paid every", "compounded at maturity".

━━━ CRITICAL FIELD 5: INVESTMENT START DATE ━━━
Look for: "Date of Deposit", "Commencement Date", "Effective Date", "date of receipt".
This is when interest starts accruing. Convert to YYYY-MM-DD.

━━━ OTHER FIELDS ━━━
Extract if clearly present, otherwise null:
- agreement_date: date the agreement was signed ("This Agreement is made on", "Dated")
- investor_name, investor_pan, investor_aadhaar, investor_address
- roi_percentage: the annual interest rate (e.g. 12.5)
- interest_type: "simple" or "compound"
- lock_in_years: number of years
- nominees: [{name, pan}]
- payments: any actual payment tranches already made [{date, mode, bank, amount}]
- tds_filing_name: name used for TDS filing if different from investor name

Return ONLY valid JSON matching this schema. Populate payout_schedule with every row extracted from the document's payment schedule table.

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
  "principal_amount": 0 or null,
  "roi_percentage": 0 or null,
  "payout_frequency": "monthly|quarterly|biannual|annual|cumulative",
  "interest_type": "simple|compound",
  "lock_in_years": 0 or null,
  "maturity_date": "YYYY-MM-DD or null",
  "payments": [{"date": "YYYY-MM-DD or null", "mode": "string or null", "bank": "string or null", "amount": 0}],
  "payout_schedule": [{"period_from": "YYYY-MM-DD", "period_to": "YYYY-MM-DD", "no_of_days": 0, "due_by": "YYYY-MM-DD", "gross_interest": 0, "tds_amount": 0, "net_interest": 0, "is_principal_repayment": false, "is_tds_only": false}],
  "confidence_warnings": [],
  "confidence": {"agreement_date": 1.0, "investment_start_date": 1.0, "principal_amount": 1.0, ...}
}`

async function withRetry<T>(fn: () => Promise<T>, retries = 2, label = 'operation'): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        const delay = Math.min(1000 * 2 ** attempt, 5000)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw new Error(`${label} failed after ${retries + 1} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

function sanitizeExtracted(data: ExtractedAgreement): ExtractedAgreement {
  const numericFields = ['principal_amount', 'roi_percentage', 'lock_in_years'] as const
  for (const field of numericFields) {
    if (data[field] != null && typeof data[field] !== 'number') {
      const coerced = parseFloat(String(data[field]).replace(/,/g, ''))
      data[field] = isNaN(coerced) ? (null as unknown as number) : coerced
    }
  }

  const allowedFrequencies = ['monthly', 'quarterly', 'biannual', 'annual', 'cumulative'] as const
  type Frequency = typeof allowedFrequencies[number]
  if (data.payout_frequency && !allowedFrequencies.includes(data.payout_frequency)) {
    const mapping: Record<string, Frequency> = {
      'monthly': 'monthly', 'quarterly': 'quarterly', 'biannual': 'biannual', 'bi-annual': 'biannual',
      'half-yearly': 'biannual', 'half yearly': 'biannual', 'semi-annual': 'biannual', 'semi annual': 'biannual',
      'annual': 'annual', 'cumulative': 'cumulative', 'compounded': 'cumulative', 'compound': 'cumulative',
      'on maturity': 'cumulative', 'at maturity': 'cumulative',
    }
    data.payout_frequency = mapping[String(data.payout_frequency).toLowerCase()] || 'quarterly'
  }

  if (!Array.isArray(data.payout_schedule)) data.payout_schedule = []
  if (!Array.isArray(data.payments)) data.payments = []
  if (!Array.isArray(data.nominees)) data.nominees = []
  if (!Array.isArray(data.confidence_warnings)) data.confidence_warnings = []
  if (!data.confidence) data.confidence = {}

  return data
}

export async function extractAgreementData(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  let lastError: unknown

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await withRetry(() => extractWithClaude(fileBuffer, mimeType), 2, 'Claude extraction')
    } catch (claudeErr) {
      console.error('Claude extraction failed, falling back to Gemini:', claudeErr)
      lastError = claudeErr
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await withRetry(() => extractWithGemini(fileBuffer, mimeType), 2, 'Gemini extraction')
    } catch (geminiErr) {
      console.error('Gemini extraction failed:', geminiErr)
      lastError = geminiErr
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'no API keys configured')
  throw new Error(`Extraction failed: ${detail}`)
}

async function extractWithClaude(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  let userContent: Anthropic.MessageParam['content']

  if (mimeType === 'application/pdf') {
    userContent = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileBuffer.toString('base64'),
        },
      },
      { type: 'text', text: EXTRACTION_PROMPT },
    ]
  } else {
    const mammoth = await import('mammoth')
    const extracted = await mammoth.extractRawText({ buffer: fileBuffer })
    userContent = `${EXTRACTION_PROMPT}\n\nDocument text:\n\n${extracted.value}`
  }

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system: 'You are a precise document extraction specialist. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('\n')

  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  return sanitizeExtracted(JSON.parse(text))
}

async function extractWithGemini(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  })

  let parts: Array<string | { inlineData: { mimeType: string; data: string } }>

  if (mimeType === 'application/pdf') {
    parts = [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: fileBuffer.toString('base64'),
        },
      },
      EXTRACTION_PROMPT,
    ]
  } else {
    const mammoth = await import('mammoth')
    const extracted = await mammoth.extractRawText({ buffer: fileBuffer })
    parts = [`${EXTRACTION_PROMPT}\n\nDocument text:\n\n${extracted.value}`]
  }

  const result = await model.generateContent(parts)
  const raw = result.response.text()
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  return sanitizeExtracted(JSON.parse(text))
}
