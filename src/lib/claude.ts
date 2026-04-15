import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
})

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
  investor_relationship: string | null  // S/o, D/o, W/o
  investor_parent_name: string | null
  nominees: Array<{ name: string; pan: string }>
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

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured data from Indian investment agreement documents.

Extract ALL fields exactly as they appear in the document. Follow these rules:

1. DATES: Always return dates in ISO format (YYYY-MM-DD). The agreement_date is the date the agreement was signed. The investment_start_date is when the money was actually received/paid (may differ from agreement_date — look at the payment table).

2. PAYOUT SCHEDULE: Extract EVERY row from the interest payout table. Each row has:
   - period_from and period_to (the interest accrual period)
   - no_of_days (number of days in that period)
   - due_by (the "on or before" date — this is when payment must be made)
   - gross_interest (interest before TDS)
   - tds_amount (tax deducted at source, typically 10%)
   - net_interest (gross_interest minus tds_amount)
   - is_principal_repayment: true ONLY for the final row if it represents principal return

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

Return ONLY valid JSON matching the ExtractedAgreement schema. No explanation, no markdown.`

export async function extractAgreementData(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  // For DOCX, convert to text first using mammoth
  let content: Anthropic.MessageParam['content']

  if (mimeType === 'application/pdf') {
    content = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileBuffer.toString('base64'),
        },
      },
      {
        type: 'text',
        text: 'Extract all agreement data from this document and return as JSON.',
      },
    ]
  } else {
    // DOCX — extract text via mammoth
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: fileBuffer })
    content = [
      {
        type: 'text',
        text: `Extract all agreement data from the following investment agreement document text and return as JSON:\n\n${result.value}`,
      },
    ]
  }

  let response: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    throw new Error(`Claude API call failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const textContent = response.content.find(c => c.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  // Strip any markdown code fences if present
  const json = textContent.text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`Claude returned invalid JSON. Response: ${json.slice(0, 300)}`)
  }

  const extracted = parsed as ExtractedAgreement

  // Validate critical numeric fields (LLM may return strings despite instructions)
  const numericFields = ['principal_amount', 'roi_percentage', 'lock_in_years'] as const
  for (const field of numericFields) {
    if (typeof extracted[field] !== 'number') {
      throw new Error(`Extracted field '${field}' is not a number: ${JSON.stringify(extracted[field])}`)
    }
  }

  // Validate payout schedule rows
  if (!Array.isArray(extracted.payout_schedule)) {
    throw new Error('Extracted payout_schedule is not an array')
  }
  for (const row of extracted.payout_schedule) {
    for (const f of ['gross_interest', 'tds_amount', 'net_interest'] as const) {
      if (typeof row[f] !== 'number') {
        throw new Error(`Payout row field '${f}' is not a number: ${JSON.stringify(row[f])}`)
      }
    }
  }

  return extracted
}
