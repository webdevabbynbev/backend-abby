import Brand from '#models/brand'
import { slugify } from '#services/product_csv_import/csv_value_utils'
import UniqueSlugService from '#services/product_csv_import/unique_slug_service'

export default class BrandLookup {
  private cache = new Map<string, number>()

  constructor(private uniqueSlug = new UniqueSlugService()) {}

  async getId(name: string, trx: any): Promise<number | undefined> {
    const n = String(name || '').trim()
    if (!n) return undefined

    const key = n.toLowerCase()
    if (this.cache.has(key)) return this.cache.get(key)

    const exist = await Brand.query({ client: trx }).where('name', n).first()
    if (exist) {
      this.cache.set(key, exist.id)
      return exist.id
    }

    const baseSlug = slugify(n) || 'brand'
    const slug = await this.uniqueSlug.ensureUniqueSlug('brands', baseSlug, trx)

    const created = await Brand.create({ name: n, slug, isActive: 1 as any } as any, { client: trx })
    this.cache.set(key, created.id)
    return created.id
  }

  // optional kalau mau reuse instance tapi reset cache tiap import-run
  resetCache() {
    this.cache.clear()
  }
}
