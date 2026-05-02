import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// Deskew: try multiple rotation angles, pick the one with highest horizontal edge concentration.
// Scanned docs are often off by <1.5° which breaks digit reading in tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deskewImage(sharp: any, pngBuffer: Buffer): Promise<Buffer> {
  const angles = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5]
  let bestScore = -1
  let bestAngle = 0

  for (const angle of angles) {
    let img = sharp(pngBuffer)
    if (angle !== 0) {
      img = img.rotate(-angle, { background: { r: 255, g: 255, b: 255 } })
    }
    const buf = await img
      .resize({ width: 500 })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const score = measureHorizontalEdges(buf.data, buf.info.width, buf.info.height)
    if (score > bestScore) {
      bestScore = score
      bestAngle = angle
    }
  }

  if (bestAngle === 0) return pngBuffer

  return sharp(pngBuffer)
    .rotate(-bestAngle, { background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer()
}

// Measure horizontal edge strength using Sobel Y operator.
// Properly aligned text has strong horizontal edges; skewed text has weaker alignment.
function measureHorizontalEdges(data: Buffer, width: number, height: number): number {
  let total = 0
  const stride = width * 1 // 1 channel (greyscale)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = (dx: number, dy: number) => data[(y + dy) * stride + (x + dx)] ?? 0
      // Sobel Y kernel: detects horizontal edges (text baselines)
      // [ 1,  2,  1]
      // [ 0,  0,  0]
      // [-1, -2, -1]
      const gy =
        -1 * p(-1, -1) -
        2 * p(0, -1) -
        1 * p(1, -1) +
        1 * p(-1, 1) +
        2 * p(0, 1) +
        1 * p(1, 1)
      total += Math.abs(gy)
    }
  }
  return total
}

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
    // 4x scale for maximum clarity on small table numbers
    const viewport = page.getViewport({ scale: 4.0 })

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      // @ts-expect-error — canvasContext expects a specific type that the canvas library provides but doesn't perfectly match the internal DOM types
      canvasContext: context,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer('image/png')

    // Step 1: Deskew — correct rotation for scanned docs
    const deskewed = await deskewImage(sharp, pngBuffer)

    // Step 2: Contrast boost + adaptive threshold → binary-like B&W
    // Makes numbers pop from colored backgrounds, stamps, and watermarks
    const processed = await sharp(deskewed)
      .linear(1.5, -30) // Boost contrast: multiply by 1.5, shift darker
      .normalise() // Histogram stretch for maximum contrast
      .threshold(140) // Binary threshold — numbers pop from backgrounds
      .median(3) // Remove small noise speckles (prevents false decimal points)
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

RULE 1 — PRINCIPAL AMOUNT (MOST CRITICAL — READ EACH DIGIT):
This is the most important field. A single extra zero is a catastrophic 10x error.
  - STEP A (WORDS): Find the principal amount written in WORDS (e.g., "Rupees Sixty Lakhs Only", "Sixty Lakhs"). This is your PRIMARY source of truth.
  - STEP B (DIGITS): Find the principal amount in DIGITS. Read each digit INDIVIDUALLY. Pay special attention to Indian comma notation:
    - 1,00,000 = 1 Lakh (5 digits after removing commas)
    - 10,00,000 = 10 Lakhs (6 digits after removing commas)
    - 1,00,00,000 = 1 Crore (7 digits after removing commas)
    - 10,00,00,000 = 10 Crores (8 digits after removing commas)
  - STEP C (CROSS-CHECK): Verify against the payout schedule. Annual interest = principal × roi/100. Does the gross_interest in payout rows match this calculation?
  - CONFLICT RESOLUTION: If words say "Sixty Lakhs" but digits look like "6,00,00,000" (6 Crores), USE 6000000. Words are always more reliable than digits.

RULE 2 — PAYOUT SCHEDULE (READ EACH CELL DIGIT-BY-DIGIT):
Extract EVERY row from the interest payout table. For each cell, read every digit individually:
  - period_from and period_to: the interest accrual period dates
  - no_of_days: number of days in that period
  - due_by: the "on or before" payment date
  - gross_interest: interest amount before TDS — read each digit carefully, note comma positions
  - tds_amount: tax deducted at source (typically 10% of gross_interest)
  - net_interest: gross_interest minus tds_amount
  - is_principal_repayment: true ONLY for the final row if it represents principal return

  ROW COUNT: Count the rows in the document's payout table BEFORE returning JSON. Your payout_schedule array must contain exactly that many entries.

  MATH SELF-CHECK: For every non-principal row:
    - tds_amount must equal round(gross_interest × 0.10, 2)
    - net_interest must equal round(gross_interest - tds_amount, 2)
  If any row fails, correct it before returning.

  PERIOD COVERAGE: The rows must cover from investment_start_date to maturity_date with no gaps:
    - Row 1 period_from = investment_start_date
    - Last non-principal row period_to = maturity_date
    - Each row's period_from = day after previous row's period_to

RULE 3 — INVESTMENT START DATE (CRITICAL):
  - Find the date explicitly stated as "investment commences", "interest starts", "effective from", "date of deposit", or similar phrasing in the document body.
  - If no explicit start date is stated, use the period_from from the FIRST row of the payout schedule table.
  - IMPORTANT: Do NOT assume the agreement_date (signed date) is the investment start date unless the document explicitly says so.
  - If the stated start date conflicts with the first payout row's period_from, add a confidence_warning and use the period_from from the first payout row.

RULE 4 — DATES:
  Always return dates in ISO format (YYYY-MM-DD). The agreement_date is the date the agreement was signed.

RULE 5 — PAYOUT FREQUENCY:
  - "monthly" if interest is paid every month
  - "quarterly" if interest is paid every quarter
  - "biannual" if interest is paid every 6 months (also: "bi-annual", "half-yearly", "semi-annual", "half yearly", "semi annual")
  - "annual" if interest is paid annually (once per year)
  - "cumulative" if interest is paid at maturity only (also: "compounded", "compound", "on maturity", "at maturity")

RULE 6 — INTEREST TYPE:
  - "compound" if the principal grows each period (interest is reinvested)
  - "simple" otherwise (fixed interest each period)

RULE 7 — NOMINEES:
  Extract name and PAN of all nominees listed in the document.

RULE 8 — PAN AND AADHAAR:
  Look for "PAN No", "Aadhaar No", "Income Tax PAN", "UID No", "Permanent Account Number" or similar labels.
  - SEARCH STRATEGY: If not found in the primary applicant section, scan the signature pages and witness/verification section at the end. These details are often placed there.
  - MULTI-APPLICANT: If multiple investors, find IDs for BOTH. Combine as "PAN1 / PAN2" or prioritize the first applicant.
  - If the value is hand-written or blurry, attempt to read it. If you cannot read it, add a confidence_warning.

RULE 9 — INVESTOR NAME:
  Extract the full name(s) of the investor(s). If joint applicants, include BOTH (e.g., "Amrit and Dwaraka Pandurangi").
  - If the first page uses generic references ("Party of the Second Part"), scan the signature blocks at the end for actual names.

RULE 10 — TDS FILING NAME:
  Extract the name under which TDS is to be deducted/filed. This is typically the primary applicant's name. If the document explicitly states a TDS deductee name, use that. Otherwise default to the first investor name.

RULE 11 — PRINCIPAL REPAYMENT ROW:
  Mark is_principal_repayment: true ONLY if:
    - The row's gross_interest equals or approximately equals the principal_amount, OR
    - The row label contains "Principal", "Maturity Amount", or "Repayment"
  Do NOT add extra rows beyond what's in the document. Do NOT mark a row as principal if its amount matches normal periodic interest.

RULE 12 — COMPOUND INTEREST TDS ROWS:
  For compound interest agreements, TDS must be filed each Indian financial year (1 April – 31 March). Extract one TDS row per financial year overlapping with the investment term, including partial first and last years. These rows have is_tds_only: true. Set is_tds_only: false for all regular interest payout rows.

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
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      // @ts-expect-error — thinkingConfig is supported but not yet in type definitions
      thinkingConfig: { thinkingBudget: 2048 },
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
