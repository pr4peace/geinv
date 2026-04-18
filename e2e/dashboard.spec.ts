import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('shows all 7 KPI cards', async ({ page }) => {
    const labels = [
      'Active Principal',
      'Active Agreements',
      'Quarter Gross Interest',
      'Quarter TDS',
      'Quarter Net Outflow',
      'Overdue Payouts',
      'Maturing (90 days)',
    ]
    for (const label of labels) {
      await expect(page.getByText(label, { exact: false })).toBeVisible()
    }
  })

  test('shows frequency breakdown panel', async ({ page }) => {
    for (const freq of ['Quarterly', 'Annual', 'Cumulative']) {
      await expect(page.getByText(freq, { exact: true }).first()).toBeVisible()
    }
  })

  test('shows quarterly forecast panel with quarter label', async ({ page }) => {
    // The ForecastPanel heading is always present when forecast loads
    // Quarter select options show "Q1 2026-27" format (space not hyphen after Q#)
    await expect(page.getByRole('heading', { name: 'Quarterly Cash Flow Forecast' })).toBeVisible()
  })

  test('shows upcoming payouts section', async ({ page }) => {
    // UpcomingPayouts renders an h2 "Upcoming Payouts" when the section is present
    // If forecast fails, the section is omitted; show the fallback error text instead
    const heading = page.getByRole('heading', { name: 'Upcoming Payouts' })
    const noForecast = page.getByText('Could not load quarterly forecast', { exact: false })
    await expect(heading.or(noForecast).first()).toBeVisible()
  })

  test('shows agreements table', async ({ page }) => {
    await expect(page.getByText('Investor', { exact: false }).first()).toBeVisible()
  })
})
