import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function migrate() {
  const migrationsDir = join(process.cwd(), 'supabase/migrations')
  const files = readdirSync(migrationsDir).sort()

  for (const file of files) {
    if (!file.endsWith('.sql')) continue
    console.log(`Running migration: ${file}`)
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    const { error } = await supabase.rpc('exec_sql', { sql })
    if (error) {
      // Try direct query approach
      console.log(`RPC failed, trying direct approach for ${file}`)
      console.log('Please run this SQL manually in Supabase SQL Editor:')
      console.log(sql)
      console.log('---')
    } else {
      console.log(`✓ ${file}`)
    }
  }
}

migrate().catch(console.error)
