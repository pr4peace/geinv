import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Finds an existing investor by PAN (preferred) or name, or creates a new one.
 * Returns the investor id.
 */
export async function findOrCreateInvestor(
  supabase: SupabaseClient,
  {
    name,
    pan,
    aadhaar,
    address,
    birth_year,
  }: {
    name: string
    pan?: string | null
    aadhaar?: string | null
    address?: string | null
    birth_year?: number | null
  }
): Promise<string> {
  // Normalize name: trim and collapse internal whitespace
  const normalizedName = name.trim().replace(/\s+/g, ' ')

  // 1. Match by PAN (most reliable) — backfill any null KYC fields
  if (pan) {
    const { data: existing } = await supabase
      .from('investors')
      .select('id, aadhaar, address, birth_year')
      .eq('pan', pan)
      .single()
    if (existing?.id) {
      const updates: Record<string, unknown> = {}
      if (!existing.aadhaar && aadhaar) updates.aadhaar = aadhaar
      if (!existing.address && address) updates.address = address
      if (!existing.birth_year && birth_year) updates.birth_year = birth_year
      if (Object.keys(updates).length > 0) {
        await supabase.from('investors').update(updates).eq('id', existing.id)
      }
      return existing.id
    }
  }

  // 2. Match by normalized name (case-insensitive)
  const { data: byName } = await supabase
    .from('investors')
    .select('id')
    .ilike('name', normalizedName)
    .limit(1)
  if (byName && byName.length > 0) return byName[0].id

  // 3. Create new investor
  const { data: created, error } = await supabase
    .from('investors')
    .insert({ name: normalizedName, pan: pan ?? null, aadhaar: aadhaar ?? null, address: address ?? null, birth_year: birth_year ?? null })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Failed to create investor: ${error?.message}`)
  }

  return created.id
}
