import { test, expect } from '@playwright/test'

test.describe('Agreements', () => {
  test('agreements list page loads with table', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')
    // Check page renders heading and table content
    await expect(page.getByText('Agreements', { exact: false }).first()).toBeVisible()
    // Look for table headers or content
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('filter controls are visible', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')
    // Look for select/dropdown filter elements
    const selects = page.locator('select')
    await expect(selects.first()).toBeVisible()
  })

  test('status filter buttons are visible', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')
    // Status filter buttons (All, Active agreements, Matured, Cancelled, Combined)
    await expect(page.getByRole('button', { name: /All/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Active agreements/i })).toBeVisible()
  })

  test('new agreement button is visible', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')
    // Look for a link to create new agreement
    const newBtn = page.getByRole('link', { name: /new agreement/i })
    await expect(newBtn).toBeVisible()
  })

  test('agreement detail page shows payout schedule', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')

    // Try to click first agreement row link
    const firstTableCell = page.locator('table tbody tr td a').first()
    const hasLink = await firstTableCell.count() > 0

    if (hasLink) {
      await firstTableCell.click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('Payout Schedule', { exact: false })).toBeVisible()
    }
  })

  test('agreement detail page shows reminder history', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')

    // Try to click first agreement row link
    const firstTableCell = page.locator('table tbody tr td a').first()
    const hasLink = await firstTableCell.count() > 0

    if (hasLink) {
      await firstTableCell.click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('Reminder History', { exact: false })).toBeVisible()
    }
  })

  test('can navigate back from agreement detail', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')

    // Click first agreement
    const firstTableCell = page.locator('table tbody tr td a').first()
    const hasLink = await firstTableCell.count() > 0

    if (hasLink) {
      await firstTableCell.click()
      await page.waitForLoadState('networkidle')

      // Click back link
      const backLink = page.getByRole('link', { name: /All Agreements/i })
      await expect(backLink).toBeVisible()
      await backLink.click()
      await page.waitForLoadState('networkidle')

      // Should be back on agreements list
      await expect(page.getByText('Agreements', { exact: false }).first()).toBeVisible()
    }
  })
})
