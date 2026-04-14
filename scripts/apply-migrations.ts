/**
 * Apply migrations directly to Supabase via the REST API.
 * Uses the pg extension's ability to run arbitrary SQL via a helper function
 * that we create first, then drop after.
 *
 * Since Supabase doesn't expose a generic SQL RPC, we use the HTTP API
 * directly against the database connection string approach via the
 * Supabase management API endpoint.
 *
 * Fallback: outputs the combined SQL for manual paste into SQL Editor.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Extract project ref from URL
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0]

async function runSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({}))
  return { ok: false, error: (body as any).message || res.statusText }
}

async function applyMigrations() {
  const combinedPath = join(process.cwd(), 'supabase/migrations/000_combined.sql')
  const sql = readFileSync(combinedPath, 'utf-8')

  console.log('Attempting to apply migrations via Supabase RPC...')
  const result = await runSQL(sql)

  if (result.ok) {
    console.log('✓ Migrations applied successfully')
    return
  }

  console.log(`RPC not available (${result.error})`)
  console.log('')
  console.log('='.repeat(60))
  console.log('ACTION REQUIRED: Run the following SQL in Supabase SQL Editor:')
  console.log(`https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`)
  console.log('='.repeat(60))
  console.log('')
  console.log('Copy and paste the contents of:')
  console.log('  supabase/migrations/000_combined.sql')
  console.log('')
  console.log('Or paste this SQL directly:')
  console.log('-'.repeat(60))
  console.log(sql)
  console.log('-'.repeat(60))
}

applyMigrations().catch(console.error)
