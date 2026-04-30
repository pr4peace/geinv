import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

async function pdfToHighContrastImages(buffer: Buffer): Promise<Buffer[]> {
  const sharp = (await import('sharp')).default
  // pdfjs legacy build required for Node.js environments
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('canvas')

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise

  const images: Buffer[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 2.5 }) // 2.5x for high resolution

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      // @ts-expect-error — canvasContext expects a specific type that the canvas library provides but doesn't perfectly match the internal DOM types
      canvasContext: context,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer('image/png')

    // High-contrast B&W: greyscale → normalise → sharpen
    const processed = await sharp(pngBuffer)
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.5 })
      .png()
      .toBuffer()

    images.push(processed)
  }

  return images
}

export interface ExtractedPayoutRow {
  period_from: string        // ISO date
  period_to: string          // ISO date
  no_of_days: number | null
  due_by: string             // ISO date — the "on or before" date
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
  is_tds_only: boolean
}

export interface ExtractedAgreement {
  agreement_date: string           // ISO date
  investment_start_date: string    // ISO date — when interest starts
  agreement_type: string
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  nominees: Array<{ name: string; pan: string }>
  tds_filing_name: string | null   // name under which TDS should be filed
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
}

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from Indian investment agreement documents.

Extract ALL fields exactly as they appear in the document. Follow these rules:

1. DATES: Always return dates in ISO format (YYYY-MM-DD). The agreement_date is the date the agreement was signed.
   - investment_start_date is the date when interest begins accruing. 
   - CRITICAL RULE: The investment_start_date MUST match exactly with the 'period_from' of the FIRST row in the payout_schedule. 
   - The payout schedule reflects the agreed-upon interest accrual. Even if funds were received on a different date (payment table), for the purposes of this system, the start of the first interest period IS the investment_start_date.
   - NEVER use the agreement_date as investment_start_date unless it happens to be the same as the first period_from.
   - Add a confidence_warning if you find a conflict between the stated 'investment commences on' date and the first row of the payout table.

2. PRINCIPAL AMOUNT (TRIPLE-VERIFICATION REQUIRED):
   - This is the MOST CRITICAL field. You must use this search protocol:
   - STEP A (Words): Locate the principal amount written in WORDS (e.g., "Sixty Lakhs"). This is your primary source of truth.
   - STEP B (Digits): Locate the principal amount in DIGITS (e.g., "60,00,000").
   - STEP C (Check): Count the digits. 
     - 7 digits total (e.g., 60,00,000) = Lakhs.
     - 8 or more digits total (e.g., 6,00,00,000) = Crores.
   - CONFLICT RESOLUTION: If digits look like 6,00,00,000 but words say "Sixty Lakhs", YOU MUST USE 6000000. Words are more reliable.
   - CROSS-CHECK: Verify this amount against the Payout Schedule table and any Receipt/Payment sections.

3. AMOUNTS (Indian Notation Awareness):
   Be extremely careful with Lakhs vs Crores:
   - 1,00,000 = 1 Lakh (5 zeros)
   - 10,00,000 = 10 Lakhs (6 zeros)
   - 1,00,00,000 = 1 Crore (7 zeros)
   A single extra zero is a catastrophic 10x error. Count the zeros one by one!

4. PAYOUT SCHEDULE: Extract EVERY row from the interest payout table. Each row has:
   - period_from and period_to (the interest accrual period)
   - no_of_days (number of days in that period)
   - due_by (the "on or before" date — this is when payment must be made)
   - gross_interest (interest before TDS)
   - tds_amount (tax deducted at source, typically 10%)
   - net_interest (gross_interest minus tds_amount)
   - is_principal_repayment: true ONLY for the final row if it represents principal return (see rule 10)

5. PAYOUT FREQUENCY:
   - "monthly" if interest is paid every month
   - "quarterly" if interest is paid every quarter
   - "biannual" if interest is paid every 6 months (also: "bi-annual", "half-yearly", "semi-annual", "half yearly", "semi annual")
   - "annual" if interest is paid annually (once per year)
   - "cumulative" if interest is paid at maturity only (also: "compounded", "compound", "on maturity", "at maturity")

5. INTEREST TYPE:
   - "compound" if principal grows each period
   - "simple" otherwise

6. NOMINEES: Extract name and PAN of all nominees listed.

7. PAN AND AADHAAR: Look for "PAN No", "Aadhaar No", "Income Tax PAN", "UID No", "Permanent Account Number" or similar labels.
   - SEARCH STRATEGY: If not found in the primary applicant details section, YOU MUST scan the signature pages and the witness/verification section at the end of the document. These details are often placed there.
   - MULTI-APPLICANT RULE: If the agreement mentions multiple investors (e.g., "Person A and Person B"), you must try to find IDs for BOTH. Combine them if possible (e.g., "PAN1 / PAN2") or at least prioritize the first applicant.
   - DO NOT SKIP: If you see a label for PAN or Aadhaar but the value is hand-written or blurry, attempt to read it carefully. If you absolutely cannot read it, add a confidence_warning.

8. INVESTOR NAME: Extract the full name(s) of the investor(s). 
   - If there are joint applicants, include BOTH names (e.g., "Amrit and Dwaraka Pandurangi").
   - SEARCH PROTOCOL: If the first page refers to the investor generically (e.g., "The Party of the Second Part"), you MUST scan the signature blocks at the end of the document to find the actual names.

9. TDS FILING NAME: Extract the name under which TDS is to be deducted/filed. This is typically the primary applicant's name. If the document explicitly states a TDS deductee name, use that. Otherwise default to the first investor name.

10. PRINCIPAL REPAYMENT ROW: The final row in the payment table often contains the principal return. Mark is_principal_repayment: true ONLY if:
    - The row's gross_interest value equals or approximately equals the principal_amount, OR
    - The row label/description contains words like "Principal", "Maturity Amount", or "Repayment"
    Do NOT add extra rows beyond what appears in the document table. Do NOT mark a row as principal repayment if its amount matches a normal periodic interest payment.

11. PAYMENTS:

12. ROW COUNT VERIFICATION: Before returning JSON, count the rows in the payout schedule table in the document. Your payout_schedule array must contain exactly that many entries — not more, not fewer. If your count does not match, re-read the table and correct it.

13. MATH SELF-CHECK: For every payout row (non-principal rows only), verify:
    - tds_amount = round(gross_interest × 0.10, 2)
    - net_interest = round(gross_interest - tds_amount, 2)
    If any row fails either check, correct the values before returning. Do not return rows with mismatched numbers.

14. PERIOD COVERAGE: Your payout rows must cover the complete period from investment_start_date to maturity_date with no gaps. Verify:
    - Does period_from of row 1 equal investment_start_date?
    - Does period_to of the last non-principal row equal maturity_date?
    - Does period_from of each row equal the day after period_to of the previous row?
    If any check fails, re-read the document and add the missing row(s).

15. COMPOUND INTEREST TDS ROWS:
 For compound interest agreements (interest_type = "compound"), TDS must be filed each Indian financial year (1 April – 31 March). You must extract one TDS row per financial year that overlaps with the investment term, including partial first and last years. These rows have is_tds_only: true. If the document shows annual TDS deduction rows, extract all of them — do not stop at 3 rows if the term spans 4 financial years. Set is_tds_only: false for all regular interest payout rows.

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
  "payout_frequency": "monthly|quarterly|biannual|annual|cumulative",
  "interest_type": "simple|compound",
  "lock_in_years": 0,
  "maturity_date": "YYYY-MM-DD",
  "payments": [{"date": "YYYY-MM-DD or null", "mode": "string or null", "bank": "string or null", "amount": 0}],
  "payout_schedule": [{"period_from": "YYYY-MM-DD", "period_to": "YYYY-MM-DD", "due_by": "YYYY-MM-DD", "gross_interest": 0, "tds_amount": 0, "net_interest": 0, "is_principal_repayment": false, "is_tds_only": false}],
  "confidence_warnings": []
}`

export async function extractAgreementData(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      // @ts-expect-error — thinkingConfig is supported but not yet in type definitions
      thinkingConfig: { thinkingBudget: 0 },
    }
  })

  let result: Awaited<ReturnType<typeof model.generateContent>>

  try {
    if (mimeType === 'application/pdf') {
      let parts: Parameters<typeof model.generateContent>[0]

      try {
        // Convert PDF pages to high-contrast B&W images for accurate number reading
        const pageImages = await pdfToHighContrastImages(fileBuffer)
        parts = [
          ...pageImages.map(img => ({
            inlineData: {
              mimeType: 'image/png' as const,
              data: img.toString('base64'),
            },
          })),
          EXTRACTION_PROMPT,
        ]
      } catch (err) {
        console.error('PDF pre-processing failed, falling back to raw PDF:', err)
        // Fall back to raw PDF if image conversion fails (e.g. missing native deps)
        parts = [
          {
            inlineData: {
              mimeType: 'application/pdf' as const,
              data: fileBuffer.toString('base64'),
            },
          },
          EXTRACTION_PROMPT,
        ]
      }

      result = await model.generateContent(parts)
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

  let text: string
  try {
    text = result.response.text()
  } catch (err) {
    if (err instanceof Error && err.message.includes('finishReason: RECITATION')) {
      throw new Error('Gemini failed to generate content due to safety filters (potential recitation). Please try a different document.')
    }
    throw err
  }

  // Check if Gemini hit token limit
  const finishReason = result.response.candidates?.[0]?.finishReason
  const hitTokenLimit = finishReason === 'MAX_TOKENS'

  // Strip markdown code fences if present
  const json = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim()

  let parsed: unknown

  // Try parsing as-is first
  const directParse = (() => { try { return JSON.parse(json) } catch { return null } })()

  if (directParse) {
    parsed = directParse
  } else if (hitTokenLimit) {
    // Gemini hit MAX_TOKENS — attempt to repair partial JSON by closing unclosed structures
    const repaired = repairPartialJson(json)
    const repairedParse = (() => { try { return JSON.parse(repaired) } catch { return null } })()
    if (repairedParse) {
      // Add warning about truncation
      if (!repairedParse.confidence_warnings) repairedParse.confidence_warnings = []
      repairedParse.confidence_warnings.push(
        'WARNING: Gemini hit output token limit — some fields may be incomplete. Check investor address and payout schedule carefully.'
      )
      if (!Array.isArray(repairedParse.payout_schedule)) repairedParse.payout_schedule = []
      parsed = repairedParse
    } else {
      throw new Error(
        'Gemini hit its output limit and the response could not be recovered. ' +
        'Try splitting the document into smaller sections, or use the manual entry form.'
      )
    }
  } else {
    throw new Error(`Gemini returned invalid JSON. Response: ${json.slice(0, 300)}`)
  }

  // Repair helper — closes unclosed JSON strings, arrays, and objects
  function repairPartialJson(partial: string): string {
    let s = partial.trimEnd()
    // Close unclosed string — if odd number of unescaped quotes
    const quoteCount = (s.match(/(?<!\\)"/g) ?? []).length
    if (quoteCount % 2 !== 0) s += '"'
    // Count unclosed braces/brackets
    let braces = 0, brackets = 0
    let inStr = false
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (c === '"' && (i === 0 || s[i - 1] !== '\\')) inStr = !inStr
      if (!inStr) {
        if (c === '{') braces++
        if (c === '}') braces--
        if (c === '[') brackets++
        if (c === ']') brackets--
      }
    }
    // Close any open array/object with null values to make valid JSON
    if (brackets > 0) s += ']'.repeat(brackets)
    if (braces > 0) s += '}'.repeat(braces)
    return s
  }

  const data = parsed as ExtractedAgreement

  // Validate critical numeric fields
  const numericFields = ['principal_amount', 'roi_percentage', 'lock_in_years'] as const
  for (const field of numericFields) {
    if (typeof data[field] !== 'number') {
      throw new Error(`Extracted field '${field}' is not a number: ${JSON.stringify(data[field])}`)
    }
  }

  // Validate payout_frequency
  const allowedFrequencies = ['monthly', 'quarterly', 'biannual', 'annual', 'cumulative']
  if (!allowedFrequencies.includes(data.payout_frequency)) {
    throw new Error(`Extracted invalid payout_frequency: ${data.payout_frequency}`)
  }

  // Validate and coerce payout schedule numeric fields — null/missing → 0
  if (!Array.isArray(data.payout_schedule)) {
    throw new Error('Extracted payout_schedule is not an array')
  }
  for (const row of data.payout_schedule) {
    for (const f of ['gross_interest', 'tds_amount', 'net_interest'] as const) {
      if (row[f] == null) {
        row[f] = 0
      } else if (typeof row[f] !== 'number') {
        const coerced = parseFloat(String(row[f]).replace(/,/g, ''))
        row[f] = isNaN(coerced) ? 0 : coerced
      }
    }
  }

  return data
}
