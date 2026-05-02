import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function listMembers() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase.from('team_members').select('*')
  if (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
  console.log(JSON.stringify(data, null, 2))
}

listMembers().catch(console.error)
