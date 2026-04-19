import { test, expect } from '@playwright/test'

test.describe('Workflow: Agreements table — frequency filter', () => {
  test('selecting quarterly frequency does not break the table', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')

    // There are two <select> elements in AgreementsTable — first is frequency, second is doc status
    // Both have bg-slate-800 border border-slate-700 classes
    // Frequency select has option value "quarterly"
    const frequencySelect = page.locator('select').filter({ has: page.locator('option[value="quarterly"]') })
    await expect(frequencySelect).toBeVisible()

    await frequencySelect.selectOption('quarterly')

    // Table should still render without crashing
    await expect(page.locator('table').first()).toBeVisible()
  })
})

test.describe('Workflow: Agreements table — status filter', () => {
  test('clicking Active tab filters table and button shows active style', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')

    // Status filter buttons: All, Active agreements, Matured, Cancelled, Combined
    const activeBtn = page.getByRole('button', { name: 'Active agreements', exact: true })
    await expect(activeBtn).toBeVisible()

    await activeBtn.click()

    // After clicking Active, the button should have the highlighted class bg-green-900/60
    // Playwright class checking: assert button has bg-green-900/60 in its class attribute
    await expect(activeBtn).toHaveClass(/bg-green-900/)

    // Also assert no "matured" or "cancelled" status badges appear in the table body
    // StatusBadge renders the status text as capitalize — "matured", "cancelled"
    const maturedBadges = page.locator('tbody').locator('span', { hasText: 'matured' })
    const cancelledBadges = page.locator('tbody').locator('span', { hasText: 'cancelled' })
    await expect(maturedBadges).toHaveCount(0)
    await expect(cancelledBadges).toHaveCount(0)
  })
})

test.describe('Workflow: Calendar event click navigates to agreement', () => {
  test('clicking a calendar event chip navigates to /agreements/', async ({ page }) => {
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')

    // Event chips are <button> elements that navigate to /agreements/:id
    // They have classes including "rounded", "text-xs", "font-medium" (among others with whitespace)
    // Use Playwright's locator filtering on buttons with px-1.5 class (unique to event chips in calendar)
    const chips = page.locator('button[class*="px-1.5"][class*="rounded"][class*="text-xs"]')

    let found = false
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await chips.count()

      if (count > 0) {
        found = true
        await chips.first().click()
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveURL(/\/agreements\//)
        return
      }

      // No events this month — navigate forward
      await page.getByRole('button', { name: 'Next →' }).click()
      await page.waitForLoadState('networkidle')
    }

    if (!found) {
      test.skip(true, 'No calendar event chips found in 3 consecutive months — skipping')
    }
  })
})

test.describe('Workflow: Investors CSV download', () => {
  test('clicking Export CSV triggers a file download', async ({ page }) => {
    await page.goto('/investors')
    await page.waitForLoadState('networkidle')

    // The investors page has an <a href="/api/investors/download"> with text "Export CSV"
    const downloadLink = page.getByRole('link', { name: 'Export CSV', exact: true })
    await expect(downloadLink).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await downloadLink.click()
    const download = await downloadPromise

    const filename = download.suggestedFilename()
    expect(filename.length).toBeGreaterThan(0)
    // Filename should relate to CSV
    expect(filename.toLowerCase()).toMatch(/csv|investor/)
  })
})

test.describe('Workflow: Quarterly reports page renders breakdown', () => {
  test('page shows ROI breakdown table and Export CSV link', async ({ page }) => {
    await page.goto('/quarterly-reports')
    await page.waitForLoadState('networkidle')

    // Page renders RoiTable components with "ROI %" column header
    await expect(page.getByText('ROI %', { exact: false }).first()).toBeVisible()

    // Page also renders "%" text in table cells (roi_percentage values)
    // and the total principal section
    await expect(page.getByText('Total Active Principal', { exact: false })).toBeVisible()

    // Export CSV link exists
    const exportLink = page.getByRole('link', { name: 'Export CSV', exact: true })
    await expect(exportLink).toBeVisible()
  })
})

test.describe('Workflow: Agreement sort — column header toggles sort', () => {
  test('clicking Investor column header twice does not crash the table', async ({ page }) => {
    await page.goto('/agreements')
    await page.waitForLoadState('networkidle')

    // Sortable column headers are <th> elements with cursor-pointer
    // They render labels like "Investor", "Principal", "Rate %", "Frequency", "Start Date", "Maturity Date"
    // The Th component renders the label text directly inside the <th>
    const investorHeader = page.locator('th', { hasText: 'Investor' }).first()
    await expect(investorHeader).toBeVisible()

    // Click once (sort asc)
    await investorHeader.click()

    // Click again (toggle to desc)
    await investorHeader.click()

    // Table should still render without errors
    await expect(page.locator('table').first()).toBeVisible()
  })
})
