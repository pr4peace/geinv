import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Delete all agreements (cascades to payout_schedule, reminders, notification_queue, audit_log)
  const { error: agErr, count: agCount } = await sb
    .from('agreements')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000') // match-all trick
  if (agErr) throw new Error(`agreements delete failed: ${agErr.message}`)
  console.log(`✓ Deleted ${agCount} agreements (+ cascaded rows)`)

  // 2. Delete all investors
  const { error: invErr, count: invCount } = await sb
    .from('investors')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (invErr) {
    console.warn(`  ⚠ investors delete skipped: ${invErr.message}`)
  } else {
    console.log(`✓ Deleted ${invCount} investors`)
  }

  // 3. Wipe storage bucket
  const { data: folders, error: listErr } = await sb.storage.from('agreements').list('', { limit: 1000 })
  if (listErr) { console.warn('  ⚠ Could not list storage:', listErr.message) }
  else {
    const folderNames = (folders ?? []).filter(f => !f.id).map(f => f.name)
    console.log(`  Found ${folderNames.length} storage folders`)
    for (const folder of folderNames) {
      const { data: files } = await sb.storage.from('agreements').list(folder)
      const paths = (files ?? []).map(f => `${folder}/${f.name}`)
      if (paths.length > 0) {
        const { error: rmErr } = await sb.storage.from('agreements').remove(paths)
        if (rmErr) console.warn(`  ⚠ Could not delete ${folder}: ${rmErr.message}`)
        else console.log(`  ✓ Removed ${paths.length} file(s) from ${folder}/`)
      }
    }
    console.log('✓ Storage wiped')
  }

  // 4. Verify
  const { count: remaining } = await sb.from('agreements').select('*', { count: 'exact', head: true })
  console.log(`\nVerification — agreements remaining: ${remaining}`)
}

main().catch(console.error)
