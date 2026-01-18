import CategoryType from '#models/category_type'
import { slugify } from '#services/product_csv_import/csv_value_utils'
import UniqueSlugService from '#services/product_csv_import/unique_slug_service'

export default class CategoryLookup {
  private cache = new Map<string, number>()

  constructor(private uniqueSlug = new UniqueSlugService()) {}

  async getId(parent: string, sub1: string, sub2: string, trx: any): Promise<number | undefined> {
    const p = String(parent || '').trim()
    const s1 = String(sub1 || '').trim()
    const s2 = String(sub2 || '').trim()

    const key = `${p} > ${s1} > ${s2}`.toLowerCase()
    if (this.cache.has(key)) return this.cache.get(key)

    const upsertNode = async (name: string, parentId: number | null, level: number) => {
      const nm = String(name || '').trim()
      if (!nm) return null

      let node = await CategoryType.query({ client: trx })
        .where('name', nm)
        .where((q) => {
          if (parentId === null) q.whereNull('parent_id')
          else q.where('parent_id', parentId)
        })
        .first()

      if (node) return node

      const baseSlug = slugify(nm) || 'category'
      const slug = await this.uniqueSlug.ensureUniqueSlug('category_types', baseSlug, trx)

      node = await CategoryType.create({ name: nm, slug, parentId: parentId ?? null, level } as any, { client: trx })
      return node
    }

    let current: any = null
    if (p) current = await upsertNode(p, null, 1)
    if (!current) current = await upsertNode('Uncategorized', null, 1)
    if (s1) current = await upsertNode(s1, current.id, 2)
    if (s2) current = await upsertNode(s2, current.id, 3)

    const id = current?.id
    if (id) this.cache.set(key, id)
    return id
  }

  resetCache() {
    this.cache.clear()
  }
}
