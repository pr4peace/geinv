import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function checkDB() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase.from('team_members').select('count')
  if (error) {
    if (error.code === '42P01') {
      console.log('❌ Tables not yet created. Please run the SQL in supabase/migrations/000_combined.sql in your Supabase SQL Editor.')
    } else {
      console.error('❌ Connection error:', error.message)
    }
    process.exit(1)
  }
  console.log('✅ Database connected and team_members table exists')
}

checkDB().catch(console.error)
