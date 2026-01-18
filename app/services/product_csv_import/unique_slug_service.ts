export type SlugTable = 'products' | 'brands' | 'category_types' | 'tags' | 'concerns' | 'concern_options'

export default class UniqueSlugService {
  async ensureUniqueSlug(table: SlugTable, baseSlug: string, trx: any): Promise<string> {
    let slugText = baseSlug || 'item'
    let i = 1

    while (true) {
      const exists = await trx.from(table).where('slug', slugText).first()
      if (!exists) return slugText
      i += 1
      slugText = `${baseSlug}-${i}`
    }
  }
}
