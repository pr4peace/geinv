import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../playwright/.auth/user.json')

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(process.env.E2E_USER_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page).toHaveURL(/dashboard/)
  await page.context().storageState({ path: authFile })
})
