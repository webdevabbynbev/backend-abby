import Concern from '#models/concern'
import ConcernOption from '#models/concern_option'
import { slugify, splitList } from '#services/product_csv_import/csv_value_utils'
import UniqueSlugService from '#services/product_csv_import/unique_slug_service'

export default class ConcernLookup {
  private concernCache = new Map<string, number>()
  private optionCache = new Map<string, number>()

  constructor(private uniqueSlug = new UniqueSlugService()) {}

  async getOptionIds(concernName: string, optionListText: string, trx: any): Promise<number[]> {
    const cName = String(concernName || '').trim()
    if (!cName) return []

    const cKey = cName.toLowerCase()
    let concernId = this.concernCache.get(cKey)

    if (!concernId) {
      const existing = await Concern.query({ client: trx }).where('name', cName).first()
      if (existing) concernId = existing.id
      else {
        const baseSlug = slugify(cName) || 'concern'
        const slug = await this.uniqueSlug.ensureUniqueSlug('concerns', baseSlug, trx)
        const created = await Concern.create({ name: cName, slug } as any, { client: trx })
        concernId = created.id
      }
      this.concernCache.set(cKey, concernId)
    }

    const options = splitList(optionListText)
    const finalOptions = options.length ? options : [cName]

    const optionIds: number[] = []
    for (const opt of finalOptions) {
      const oKey = `${concernId}:${opt.toLowerCase()}`
      if (this.optionCache.has(oKey)) {
        optionIds.push(this.optionCache.get(oKey)!)
        continue
      }

      let existingOpt = await ConcernOption.query({ client: trx })
        .where('concern_id', concernId)
        .where('name', opt)
        .first()

      if (!existingOpt) {
        const baseSlug = slugify(opt) || 'concern-option'
        const slug = await this.uniqueSlug.ensureUniqueSlug('concern_options', baseSlug, trx)
        existingOpt = await ConcernOption.create({ concernId, name: opt, slug } as any, { client: trx })
      }

      this.optionCache.set(oKey, existingOpt.id)
      optionIds.push(existingOpt.id)
    }

    return optionIds
  }

  resetCache() {
    this.concernCache.clear()
    this.optionCache.clear()
  }
}
