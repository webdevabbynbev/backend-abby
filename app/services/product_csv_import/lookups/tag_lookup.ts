import Tag from '#models/tag'
import { slugify, splitList } from '#services/product_csv_import/csv_value_utils'
import UniqueSlugService from '#services/product_csv_import/unique_slug_service'

export default class TagLookup {
  private cache = new Map<string, number>()

  constructor(private uniqueSlug = new UniqueSlugService()) {}

  async getIds(tagText: string, trx: any): Promise<number[]> {
    const tags = splitList(tagText)
    const ids: number[] = []

    for (const t of tags) {
      const key = t.toLowerCase()
      if (this.cache.has(key)) {
        ids.push(this.cache.get(key)!)
        continue
      }

      let tag = await Tag.query({ client: trx }).where('name', t).first()
      if (!tag) {
        const baseSlug = slugify(t) || 'tag'
        const slug = await this.uniqueSlug.ensureUniqueSlug('tags', baseSlug, trx)
        tag = await Tag.create({ name: t, slug } as any, { client: trx })
      }

      this.cache.set(key, tag.id)
      ids.push(tag.id)
    }

    return ids
  }

  resetCache() {
    this.cache.clear()
  }
}
