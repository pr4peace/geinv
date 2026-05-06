import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'

dotenv.config({ path: '.env.local' })

const OUTPUT_DIR = path.join(process.cwd(), 'downloaded-agreements')

async function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        fs.unlinkSync(dest)
        download(res.headers.location!, dest).then(resolve).catch(reject)
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    }).on('error', (err) => {
      fs.unlinkSync(dest)
      reject(err)
    })
  })
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // Fetch investor names keyed by reference_id
  const { data: agreements } = await supabase
    .from('agreements')
    .select('reference_id, investor_name, investor2_name')
    .is('deleted_at', null)
  const nameMap: Record<string, string> = {}
  for (const a of agreements ?? []) {
    const name = a.investor2_name ? `${a.investor_name} & ${a.investor2_name}` : a.investor_name
    nameMap[a.reference_id] = name.replace(/[/\\?%*:|"<>]/g, '-')
  }

  // List all files in the agreements bucket
  const { data: files, error } = await supabase.storage.from('agreements').list('', { limit: 1000 })
  if (error) { console.error('Failed to list bucket:', error.message); process.exit(1) }

  const folders = files?.filter(f => !f.id) ?? []
  console.log(`Found ${folders.length} agreement folders`)

  let downloaded = 0
  let skipped = 0

  for (const folder of folders) {
    if (!nameMap[folder.name]) continue  // skip deleted / unknown
    const { data: folderFiles } = await supabase.storage.from('agreements').list(folder.name)
    if (!folderFiles?.length) continue

    for (const file of folderFiles) {
      const storagePath = `${folder.name}/${file.name}`
      const ext = file.name.split('.').pop() ?? 'pdf'
      const investorName = nameMap[folder.name] ?? folder.name
      const localName = `${folder.name} - ${investorName}.${ext}`
      const localPath = path.join(OUTPUT_DIR, localName)

      if (fs.existsSync(localPath)) { skipped++; continue }

      const { data: signed } = await supabase.storage.from('agreements').createSignedUrl(storagePath, 300)
      if (!signed?.signedUrl) { console.warn(`  ⚠ No URL for ${storagePath}`); continue }

      process.stdout.write(`  Downloading ${localName}... `)
      await download(signed.signedUrl, localPath)
      console.log('✓')
      downloaded++
    }
  }

  console.log(`\nDone. ${downloaded} downloaded, ${skipped} already existed → ${OUTPUT_DIR}`)
}

main().catch(console.error)
