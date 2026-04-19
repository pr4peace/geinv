# Manual Testing Checklist

These workflows modify production data or trigger real emails — run manually before each release.

## 1. Upload a New Agreement

- [ ] Click "New Agreement"
- [ ] Upload a sample agreement PDF (draft or signed mode)
- [ ] Verify AI extraction completes and all fields are populated
- [ ] Check payout schedule rows are extracted correctly (period, gross interest, TDS, net)
- [ ] Assign a salesperson from the dropdown
- [ ] Save — confirm agreement appears in the Agreements table
- [ ] Confirm reminder schedule is generated (check Reminder History on detail page)
- [ ] If draft mode: verify amber border and "Draft" badge appear on all views

## 2. Upgrade Draft to Signed

- [ ] Open a draft agreement
- [ ] Click "Upload Signed Copy"
- [ ] Upload the signed PDF
- [ ] Verify "Draft" badge and amber border disappear across all views

## 3. Payout 3-Step Checklist

- [ ] Open an upcoming payout row on the dashboard
- [ ] Expand the row — confirm Step 1 (Reminded) shows timestamp if reminder was sent
- [ ] Click "Notify Accounts" — confirm Step 2 is marked and email arrives in Valli's inbox
- [ ] Click "Mark as Paid" — confirm Step 3 is marked and payout status changes to "Paid"
- [ ] Verify payout disappears from upcoming and shows as paid on the agreement detail

## 4. Re-notify Accounts

- [ ] On a payout at Step 2 (notified), click "Re-notify Accounts"
- [ ] Confirm a second email is sent to Valli

## 5. Send to Accounts (Quarterly Forecast)

- [ ] On the dashboard, open the Quarterly Cash Flow Forecast panel
- [ ] Click "Send to Accounts"
- [ ] Confirm email arrives in Valli's inbox with correct quarter data and monthly subtotals

## 6. Document Lifecycle Stage Changes

- [ ] Open an agreement's detail page
- [ ] Advance doc_status from current stage (e.g. Draft → Partner Signed → Sent to Client)
- [ ] Verify stage updates and date is recorded
- [ ] Confirm moving to "Sent to Client" starts the 14-day return countdown
- [ ] Move to "Returned" — verify upload prompt appears
- [ ] Upload signed copy — verify status advances to "Uploaded"

## 7. Agreement Modification

- [ ] Open an agreement detail page
- [ ] Edit a field (e.g. investor address or payment mode)
- [ ] Save — confirm change persists on reload

## 8. Delete an Agreement

- [ ] Select an agreement in the Agreements table
- [ ] Click the delete (trash) icon
- [ ] Confirm deletion dialog and delete
- [ ] Verify agreement is removed from the table

## 9. Quarterly Review — Reconciliation

- [ ] Navigate to Quarterly Review
- [ ] Select a quarter
- [ ] Upload a Tally incoming funds export (Excel or PDF)
- [ ] Run reconciliation — verify Matched / Missing / Extra / Mismatch results
- [ ] Upload a Tally TDS export and run TDS reconciliation
- [ ] Download the combined reconciliation report

## 10. Investors — Merge

- [ ] Navigate to Investors
- [ ] Open an investor with a duplicate record
- [ ] Click "Merge" and select the target investor
- [ ] Confirm merged investor shows combined agreement history

## Regression Checks After Any Deployment

- [ ] Dashboard KPIs load (all 7 cards visible including Maturing 90 days)
- [ ] Frequency Breakdown panel shows Quarterly / Annual / Cumulative counts
- [ ] Calendar loads current month with events
- [ ] At least one agreement detail page loads correctly
- [ ] Investors page loads with table data
