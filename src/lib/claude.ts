import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

export interface ExtractedPayoutRow {
  period_from: string        // ISO date
  period_to: string          // ISO date
  no_of_days: number | null
  due_by: string             // ISO date — payable-to date for investor
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
  confidence?: Record<string, number>  // per-field confidence 0.0-1.0
}

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from Indian Fixed Deposit (FD) receipt documents.

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
  - due_by: the date the interest is PAYABLE TO the investor. Look for columns labeled "Payable to", "Payment date", "Due date", or "Interest date". If both a "Payable to" column and an "On or before" (TDS deadline) column exist, ALWAYS use "Payable to".
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

CONFIDENCE SCORING:
For each field, provide a confidence score between 0.0 and 1.0 indicating how certain you are of the extracted value:
  - 1.0: Clearly visible, unambiguous, verified by cross-checks
  - 0.8-0.9: Clear but slightly ambiguous or partially obscured
  - 0.6-0.7: Blurry, handwritten, or conflicting sources
  - <0.6: Very uncertain, likely guessed — flag in confidence_warnings

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
  "payout_schedule": [{"period_from": "YYYY-MM-DD", "period_to": "YYYY-MM-DD", "no_of_days": 0, "due_by": "YYYY-MM-DD", "gross_interest": 0, "tds_amount": 0, "net_interest": 0, "is_principal_repayment": false, "is_tds_only": false}],
  "confidence_warnings": [],
  "confidence": {"agreement_date": 1.0, "investment_start_date": 1.0, "agreement_type": 1.0, "investor_name": 1.0, "investor_pan": 1.0, "investor_aadhaar": 1.0, "investor_address": 1.0, "tds_filing_name": 1.0, "principal_amount": 1.0, "roi_percentage": 1.0, "payout_frequency": 1.0, "interest_type": 1.0, "lock_in_years": 1.0, "maturity_date": 1.0}
}`

// Retry a promise up to `retries` times with exponential backoff.
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

function parseAndRepair(text: string, stopReason?: string | null): unknown {
  // Strip markdown code fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  const directParse = (() => { try { return JSON.parse(cleaned) } catch { return null } })()
  if (directParse) return directParse

  // Only attempt repair if we hit token limit — otherwise the JSON is genuinely broken
  if (stopReason === 'max_tokens' || stopReason === 'MAX_TOKENS') {
    const repaired = repairPartialJson(cleaned)
    const repairedParse = (() => { try { return JSON.parse(repaired) } catch { return null } })()
    if (repairedParse) {
      if (!repairedParse.confidence_warnings) repairedParse.confidence_warnings = []
      repairedParse.confidence_warnings.push(
        'WARNING: Model hit output token limit — some fields may be incomplete. Check investor address and payout schedule carefully.'
      )
      if (!Array.isArray(repairedParse.payout_schedule)) repairedParse.payout_schedule = []
      return repairedParse
    }
  }

  throw new Error(`Invalid JSON returned. Response: ${cleaned.slice(0, 300)}`)
}

function repairPartialJson(partial: string): string {
  let s = partial.trimEnd()
  // Close unclosed string
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
  if (brackets > 0) s += ']'.repeat(brackets)
  if (braces > 0) s += '}'.repeat(braces)
  return s
}

function sanitizeExtracted(data: ExtractedAgreement): ExtractedAgreement {
  // Validate critical numeric fields — coerce or throw
  const numericFields = ['principal_amount', 'roi_percentage', 'lock_in_years'] as const
  for (const field of numericFields) {
    if (typeof data[field] !== 'number') {
      const coerced = parseFloat(String(data[field]).replace(/,/g, ''))
      if (isNaN(coerced)) {
        throw new Error(`Extracted field '${field}' is not a valid number: ${JSON.stringify(data[field])}`)
      }
      data[field] = coerced as never
    }
  }

  // Validate payout_frequency — coerce to nearest valid
  const allowedFrequencies = ['monthly', 'quarterly', 'biannual', 'annual', 'cumulative'] as const
  if (!allowedFrequencies.includes(data.payout_frequency)) {
    const lower = String(data.payout_frequency).toLowerCase()
    const mapping: Record<string, typeof allowedFrequencies[number]> = {
      'monthly': 'monthly',
      'quarterly': 'quarterly',
      'biannual': 'biannual',
      'bi-annual': 'biannual',
      'half-yearly': 'biannual',
      'half yearly': 'biannual',
      'semi-annual': 'biannual',
      'semi annual': 'biannual',
      'annual': 'annual',
      'cumulative': 'cumulative',
      'compounded': 'cumulative',
      'compound': 'cumulative',
      'on maturity': 'cumulative',
      'at maturity': 'cumulative',
    }
    const mapped = mapping[lower]
    if (mapped) {
      data.payout_frequency = mapped
      if (!data.confidence_warnings) data.confidence_warnings = []
      data.confidence_warnings.push(`Payout frequency coerced from "${data.payout_frequency}" to "${mapped}"`)
    } else {
      throw new Error(`Unrecognized payout_frequency: ${data.payout_frequency}`)
    }
  }

  // Sanitize payout schedule
  if (!Array.isArray(data.payout_schedule)) {
    data.payout_schedule = []
  }
  for (const row of data.payout_schedule) {
    for (const f of ['gross_interest', 'tds_amount', 'net_interest'] as const) {
      if (row[f] == null || typeof row[f] !== 'number') {
        row[f] = typeof row[f] === 'number' ? row[f] : parseFloat(String(row[f]).replace(/,/g, ''))
        if (isNaN(row[f])) row[f] = 0
      }
    }
    if (row.no_of_days != null && typeof row.no_of_days !== 'number') {
      const coerced = parseInt(String(row.no_of_days).replace(/,/g, ''), 10)
      row.no_of_days = isNaN(coerced) ? null : coerced
    }
    // Ensure booleans
    row.is_principal_repayment = !!row.is_principal_repayment
    row.is_tds_only = !!row.is_tds_only
  }

  // Ensure arrays
  if (!Array.isArray(data.payments)) data.payments = []
  if (!Array.isArray(data.nominees)) data.nominees = []
  if (!Array.isArray(data.confidence_warnings)) data.confidence_warnings = []

  // Ensure confidence object exists
  if (!data.confidence || typeof data.confidence !== 'object') {
    data.confidence = {}
  }

  // Ensure string fields are strings
  data.agreement_date = String(data.agreement_date || '')
  data.investment_start_date = String(data.investment_start_date || '')
  data.agreement_type = String(data.agreement_type || 'new')
  data.investor_name = String(data.investor_name || '')
  data.maturity_date = String(data.maturity_date || '')
  data.interest_type = data.interest_type === 'compound' ? 'compound' : 'simple'
  data.investor_pan = data.investor_pan ? String(data.investor_pan) : null
  data.investor_aadhaar = data.investor_aadhaar ? String(data.investor_aadhaar) : null
  data.investor_address = data.investor_address ? String(data.investor_address) : null
  data.tds_filing_name = data.tds_filing_name ? String(data.tds_filing_name) : null
  data.is_draft = !!data.is_draft

  return data
}

export async function extractAgreementData(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  // Primary: Claude Sonnet 4 (best accuracy for financial documents)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await withRetry(() => extractWithClaude(fileBuffer, mimeType), 2, 'Claude extraction')
    } catch (claudeErr) {
      console.error('Claude extraction failed, falling back to Gemini:', claudeErr)
      // Fall through to Gemini
    }
  }

  // Fallback: Gemini 2.5 Flash (still strong, cheaper)
  if (process.env.GEMINI_API_KEY) {
    try {
      return await withRetry(() => extractWithGemini(fileBuffer, mimeType), 2, 'Gemini extraction')
    } catch (geminiErr) {
      console.error('Gemini extraction also failed:', geminiErr)
    }
  }

  throw new Error('Both Claude and Gemini extraction failed. Check API keys and try again.')
}

async function extractWithClaude(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  let userContent: Anthropic.MessageParam['content']

  if (mimeType === 'application/pdf') {
    // Pre-extract text layer to inject as ground-truth digit context
    const textLayer = await extractPdfTextLayer(fileBuffer)
    const textLayerContext = textLayer && (textLayer.tableRows.length > 0 || textLayer.allAmounts.length > 0)
      ? buildTextLayerContext(textLayer)
      : ''

    userContent = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileBuffer.toString('base64'),
        },
      },
      { type: 'text', text: textLayerContext + EXTRACTION_PROMPT },
    ]
  } else {
    // DOCX → text via mammoth
    const mammoth = await import('mammoth')
    const extracted = await mammoth.extractRawText({ buffer: fileBuffer })
    userContent = `${EXTRACTION_PROMPT}\n\nDocument text:\n\n${extracted.value}`
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: 'You are a precise document extraction specialist for Indian FD receipts. Return ONLY valid JSON — no explanations, no markdown fences, no preamble.',
    messages: [{ role: 'user', content: userContent }],
  })

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('\n')

  const parsed = parseAndRepair(text, response.stop_reason) as ExtractedAgreement
  return sanitizeExtracted(parsed)
}

async function extractWithGemini(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<ExtractedAgreement> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      // @ts-expect-error — thinkingConfig is supported but not yet in type definitions
      thinkingConfig: { thinkingBudget: 2048 },
    },
  })

  let parts: Parameters<typeof model.generateContent>[0]

  if (mimeType === 'application/pdf') {
    // Pre-extract text layer to inject as ground-truth digit context
    const textLayer = await extractPdfTextLayer(fileBuffer)
    const textLayerContext = textLayer && (textLayer.tableRows.length > 0 || textLayer.allAmounts.length > 0)
      ? buildTextLayerContext(textLayer)
      : ''

    try {
      const pageImages = await pdfToHighContrastImages(fileBuffer)
      parts = [
        ...(textLayerContext ? [textLayerContext] : []),
        ...pageImages.map(img => ({
          inlineData: {
            mimeType: 'image/png' as const,
            data: img.toString('base64'),
          },
        })),
        EXTRACTION_PROMPT,
      ]
    } catch {
      parts = [
        ...(textLayerContext ? [textLayerContext] : []),
        {
          inlineData: {
            mimeType: 'application/pdf' as const,
            data: fileBuffer.toString('base64'),
          },
        },
        EXTRACTION_PROMPT,
      ]
    }
  } else {
    const mammoth = await import('mammoth')
    const extracted = await mammoth.extractRawText({ buffer: fileBuffer })
    parts = [`${EXTRACTION_PROMPT}\n\nDocument text:\n\n${extracted.value}`]
  }

  const result = await model.generateContent(parts)
  const text = result.response.text()
  const parsed = JSON.parse(text) as ExtractedAgreement
  return sanitizeExtracted(parsed)
}

// Deskew: try multiple rotation angles, pick the one with highest horizontal edge concentration.
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

function measureHorizontalEdges(data: Buffer, width: number, height: number): number {
  let total = 0
  const stride = width * 1
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = (dx: number, dy: number) => data[(y + dy) * stride + (x + dx)] ?? 0
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
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('canvas')

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise

  const images: Buffer[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 4.0 })

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      // @ts-expect-error — canvasContext type mismatch between canvas lib and PDF.js
      canvasContext: context,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer('image/png')
    const deskewed = await deskewImage(sharp, pngBuffer)

    const processed = await sharp(deskewed)
      .linear(1.5, -30)
      .normalise()
      .threshold(140)
      .median(3)
      .png()
      .toBuffer()

    images.push(processed)
  }

  return images
}

interface PdfTextLayer {
  allAmounts: string[]      // every INR-style number found
  tableRows: string[]       // lines that look like payout table rows (date + numbers)
  rawText: string           // full document text, pages joined by newline
}

async function extractPdfTextLayer(buffer: Buffer): Promise<PdfTextLayer | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise

    const pageTexts: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()

      // Group text items by Y coordinate (±3px tolerance = same line)
      const lineMap = new Map<number, string[]>()
      for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
        if (!item.str?.trim()) continue
        const y = Math.round(item.transform[5] / 3) * 3
        if (!lineMap.has(y)) lineMap.set(y, [])
        lineMap.get(y)!.push(item.str)
      }

      // Sort lines top-to-bottom (higher Y = higher on page in PDF coords)
      const sortedLines = Array.from(lineMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.join(' ').trim())
        .filter(Boolean)

      pageTexts.push(sortedLines.join('\n'))
    }

    const rawText = pageTexts.join('\n')

    // Extract all Indian-format currency amounts
    const amountRegex = /(?:₹\s*)?(\d{1,3}(?:,\d{2})*(?:,\d{3})?|\d+)(?:\.\d{2})?(?=\s|$|[,;])/g
    const amountSet = new Set<string>()
    for (const match of Array.from(rawText.matchAll(amountRegex))) {
      const val = match[0].trim()
      if (val.length >= 4) amountSet.add(val)
    }

    // Detect payout table rows: lines with date pattern AND at least 2 numbers
    const datePattern = /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}/
    const numberPattern = /\d{1,3}(?:,\d+)+|\d{4,}/g
    const tableRows = rawText
      .split('\n')
      .filter(line => {
        if (!datePattern.test(line)) return false
        const nums = line.match(numberPattern)
        return nums && nums.length >= 2
      })

    return {
      allAmounts: Array.from(amountSet),
      tableRows,
      rawText,
    }
  } catch {
    // Scanned PDFs have no text layer — fail silently
    return null
  }
}

function buildTextLayerContext(layer: PdfTextLayer): string {
  const parts: string[] = []

  parts.push('=== PRE-EXTRACTED TEXT LAYER (treat as ground truth for digits) ===')

  if (layer.tableRows.length > 0) {
    parts.push(`\nPAYOUT TABLE ROWS DETECTED (${layer.tableRows.length} rows):`)
    layer.tableRows.forEach((row, i) => {
      parts.push(`  Row ${i + 1}: ${row}`)
    })
    parts.push(`\nIMPORTANT: Your payout_schedule array MUST contain exactly ${layer.tableRows.length} non-TDS entries matching these rows.`)
  }

  if (layer.allAmounts.length > 0) {
    const sortedAmounts = layer.allAmounts
      .sort((a, b) => b.replace(/[^0-9]/g, '').length - a.replace(/[^0-9]/g, '').length)
      .slice(0, 30)
    parts.push(`\nALL NUMERIC AMOUNTS IN DOCUMENT:`)
    parts.push(`  ${sortedAmounts.join(' | ')}`)
    parts.push(`NOTE: The principal_amount MUST be one of these values. If your visual read differs, use the amount from this list.`)
  }

  parts.push('=== END PRE-EXTRACTED DATA ===\n')
  return parts.join('\n')
}
