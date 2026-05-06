# SESSION

## Branch
- main

## Phase
- data-entry (re-uploading ~180 agreements with clean DB)

## Stable Tag
- `v1.0-stable` (commit 8376dd4) — restore point before bulk re-upload
- To restore: `git checkout v1.0-stable`

---

## What's Stable in This Build

### Extraction
- Gemini extracts structured data from PDF/DOCX via text-layer grounding
- `investor_name` = primary investor only; `investor2_name` = second investor for joint agreements
- Extraction review shows: interest payouts + TDS filing preview + maturity payout card

### Payout Schedule (auto-generated on save)
- Interest rows: exactly as extracted from the agreement table
- TDS filing rows (`is_tds_only`): one per payout, Indian quarterly deadlines (Jul 31 / Oct 31 / Jan 31 / May 31); stub-period row uses correct filing deadline
- Principal repayment row: auto-added if extraction didn't produce one
- Cumulative/compound: full schedule auto-generated (accrued interest row + annual TDS rows + principal repayment)

### Agreement Detail Page (Actions section)
- **Interest Payouts card**: all rows, combined Status/Action column (Mark Paid / Undo)
- **TDS Filings card**: all `is_tds_only` rows, combined Status/Action column (Mark Filed)
- **Maturity Payout card**: principal return, falls back to agreement data if no DB row exists

### Agreements List
- Joint investors display as "Primary & Secondary" name

---

## Work Completed This Session
- Auto-generate TDS filing rows post-extraction (new + rescan paths)
- investor2 fields in extraction, ExtractionReview form, and DB
- Remove Accrued Interest column from TDS table
- Maturity payout ₹0 fix (fallback to principalAmount)
- Three unified action cards replacing PendingPayouts + PendingTdsFilings + read-only table
- Cumulative/compound full schedule auto-generation
- TDS filing deadline fix for final stub-period row
- download-pdfs.ts script (active agreements only, named by investor)
- tds_filed not-null fix on payout row insert

---

## Next Feature: Notification Reports (coordinator → accounts)
- Simple report emails triggered manually from the coordinator
- Three report types: Interest Payouts due, TDS Filings due, Maturity Payouts due
- Recipient: accounts team only (no salesperson)
- Brainstorm approach before building

## Next Agent Action
- Brainstorm notification report design with user, then implement
