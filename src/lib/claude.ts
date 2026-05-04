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

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from Indian Investment Agreement documents.

Extract the core terms of the agreement. Follow these rules strictly:

RULE 1 — PRINCIPAL AMOUNT (MOST CRITICAL):
Indian number system — memorise these exactly:
  1 Lakh     = 1,00,000       (6 digits, 2 commas)
  10 Lakhs   = 10,00,000      (7 digits, 2 commas)
  50 Lakhs   = 50,00,000      (7 digits, 2 commas)
  1 Crore    = 1,00,00,000    (8 digits, 3 commas)
  2 Crores   = 2,00,00,000    (8 digits, 3 commas)
  10 Crores  = 10,00,00,000   (9 digits, 3 commas)

- STEP A (WORDS FIRST): Find the amount in WORDS (e.g., "Rupees One Crore Only"). This is your ABSOLUTE source of truth.
- STEP B (DIGITS): Count the digits and commas in the number. "1,00,00,000" has 8 digits = ONE crore, NOT ten crores.
- NEVER add or remove a zero. "One Crore" must return 10000000, not 100000000.
- If words say "One Crore" but digits show "1,00,000" — trust the WORDS, return 10000000.
- Return the final value as a plain integer (no commas, no currency symbol).

RULE 2 — NO GUESSING:
If you have ANY doubt about a critical field (Principal, ROI, or Dates) set the value to null and add a detailed explanation in confidence_warnings. It is better to leave it empty for manual entry than to assume a wrong value.

RULE 3 — DATES (CRITICAL — do not skip):
Indian agreements use DD/MM/YYYY or DD-MM-YYYY. Convert ALL dates to ISO format YYYY-MM-DD.
Look for these labels to find each date:
- agreement_date: "This Agreement is made on", "Date:", "Dated this", "Agreement Date"
- investment_start_date: "Date of Deposit", "Commencement Date", "Effective Date", "date of receipt", "investment date" — the date interest starts accruing
- maturity_date: "Maturity Date", "Date of Maturity", "due for repayment on", "lock-in period ends"
If a date field is present in the document, you MUST extract it. Do NOT return null for a date that appears in the document.

RULE 4 — PAYOUT FREQUENCY:
- "monthly", "quarterly", "biannual" (6 months), "annual", or "cumulative" (at maturity).

RULE 5 — INVESTOR DETAILS:
- Extract full name, PAN, Aadhaar, and address. Check the signature pages if not on the first page.

RULE 6 — NOMINEES:
- Extract name and PAN of all listed nominees.

RULE 7 — PAYMENTS:
- Extract all payment tranches (date, mode, bank, amount).

Return ONLY valid JSON matching this schema. Set "payout_schedule" to an empty array [] as the system will auto-generate it.

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
  "payout_schedule": [],
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
