import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { count: a } = await sb.from('agreements').select('*', { count: 'exact', head: true })
  const { count: p } = await sb.from('payout_schedule').select('*', { count: 'exact', head: true })
  const { count: r } = await sb.from('reminders').select('*', { count: 'exact', head: true })
  console.log('agreements:       ', a)
  console.log('payout_schedule:  ', p)
  console.log('reminders:        ', r)
}

main().catch(console.error)
