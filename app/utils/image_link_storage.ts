import env from '#start/env'
import { supabaseAdmin } from '#utils/supabaseAdmin'

export const storeImageLink = async (url: string) => {
  if (!url) return
  const table = env.get('SUPABASE_IMAGE_LINKS_TABLE', 'image_links')

  try {
    const { error } = await supabaseAdmin.from(table).insert({ url })
    if (error) {
      console.warn('[storeImageLink] Supabase insert failed:', error.message)
    }
  } catch (error) {
    console.warn('[storeImageLink] Supabase insert failed:', error)
  }
}