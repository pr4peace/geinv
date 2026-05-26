interface FormState {
  agreement_type: string
  agreement_date: string
  lock_in_years: string
  salesperson_id: string
  investor_name: string
  investor_pan: string
  investor_aadhaar: string
  principal_amount: string
  roi_percentage: string
  payout_frequency: 'quarterly' | 'annual' | 'biannual' | 'monthly' | 'cumulative'
  interest_type: 'simple' | 'compound'
  investment_start_date: string
  maturity_date: string
}

export function validateCalculatorForm(form: FormState): string[] {
  const errors: string[] = []
  if (!form.investor_name.trim()) errors.push('Investor name is required')
  const principal = parseFloat(form.principal_amount)
  if (!form.principal_amount || isNaN(principal) || principal <= 0) errors.push('Principal amount must be a positive number')
  const roi = parseFloat(form.roi_percentage)
  if (!form.roi_percentage || isNaN(roi) || roi <= 0) errors.push('ROI % must be a positive number')
  if (!form.investment_start_date) errors.push('Start date is required')
  if (!form.maturity_date) errors.push('Maturity date is required')
  if (form.investment_start_date && form.maturity_date && form.maturity_date <= form.investment_start_date) {
    errors.push('Maturity date must be after start date')
  }
  return errors
}
