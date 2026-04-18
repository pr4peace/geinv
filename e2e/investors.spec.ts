import { test, expect } from '@playwright/test'

test.describe('Investors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/investors')
    await page.waitForLoadState('networkidle')
  })

  test('investors page heading is visible', async ({ page }) => {
    await expect(page.getByText('Investors', { exact: false }).first()).toBeVisible()
  })

  test('investors table renders', async ({ page }) => {
    // Table or list of investors exists
    const table = page.locator('table')
    await expect(table.first()).toBeVisible()
  })

  test('summary cards are visible', async ({ page }) => {
    // Summary cards use uppercase tracking-wide labels; use first() to avoid strict-mode violation
    await expect(page.getByText('Total Investors', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Active Investors', { exact: false }).first()).toBeVisible()
    // "Total Principal" appears in both the summary card and the table header; first() picks the card
    await expect(page.getByText('Total Principal', { exact: false }).first()).toBeVisible()
  })

  test('CSV export button is visible', async ({ page }) => {
    const csvBtn = page.getByRole('link', { name: /csv/i })
      .or(page.getByRole('button', { name: /csv/i }))
      .or(page.getByRole('link', { name: /export/i }))
    await expect(csvBtn.first()).toBeVisible()
  })

  test('table headers are visible', async ({ page }) => {
    // Use columnheader role to avoid strict-mode violations from duplicate text
    await expect(page.getByRole('columnheader', { name: 'Investor' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'PAN' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Agreements' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Total Principal' })).toBeVisible()
  })

  test('can navigate to investor detail', async ({ page }) => {
    // Try to click first investor row link
    const firstInvestorLink = page.locator('table tbody tr td a').first()
    const hasLink = await firstInvestorLink.count() > 0

    if (hasLink) {
      await firstInvestorLink.click()
      await page.waitForLoadState('networkidle')

      // Should navigate to investor detail page
      await expect(page).toHaveURL(/\/investors\//)
    }
  })
})
