import { test, expect } from '@playwright/test'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
  })

  test('shows calendar heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  })

  test('shows navigation buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: '← Prev' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
  })

  test('shows current month label', async ({ page }) => {
    const currentMonth = MONTH_NAMES[new Date().getMonth()]
    await expect(page.getByText(currentMonth, { exact: false }).first()).toBeVisible()
  })

  test('shows all legend entries including reminder scheduled', async ({ page }) => {
    const legendItems = [
      'Payout due (pending/notified)',
      'Payout overdue',
      'Payout paid',
      'Maturity date',
      'Reminder scheduled',
    ]
    for (const label of legendItems) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('navigating to next month updates the month label', async ({ page }) => {
    const now = new Date()
    const nextMonthIndex = (now.getMonth() + 1) % 12
    const nextMonthName = MONTH_NAMES[nextMonthIndex]

    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText(nextMonthName, { exact: false }).first()).toBeVisible()
  })
})
