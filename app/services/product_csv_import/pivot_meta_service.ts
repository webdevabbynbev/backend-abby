import Database from '@adonisjs/lucid/services/db'

export type PivotMeta = {
  // product_tags
  hasProductTagsTable: boolean
  productTagsTagCol: string | null
  productTagsHasStartDate: boolean
  productTagsHasEndDate: boolean
  productTagsHasCreatedAt: boolean
  productTagsHasUpdatedAt: boolean
  productTagsHasDeletedAt: boolean

  // product_concerns
  hasProductConcernsTable: boolean
  productConcernsOptionCol: string | null
  productConcernsHasCreatedAt: boolean
  productConcernsHasUpdatedAt: boolean
  productConcernsHasDeletedAt: boolean
}

export default class PivotMetaService {
  private cached: PivotMeta | null = null

  async get(): Promise<PivotMeta> {
    if (this.cached) return this.cached

    const schema = (Database as any).connection().schema as any

    // ===== product_tags =====
    const hasProductTagsTable = await schema.hasTable('product_tags')
    let productTagsTagCol: string | null = null
    let productTagsHasStartDate = false
    let productTagsHasEndDate = false
    let productTagsHasCreatedAt = false
    let productTagsHasUpdatedAt = false
    let productTagsHasDeletedAt = false

    if (hasProductTagsTable) {
      if (await schema.hasColumn('product_tags', 'tag_id')) productTagsTagCol = 'tag_id'
      else if (await schema.hasColumn('product_tags', 'tags_id')) productTagsTagCol = 'tags_id'
      else productTagsTagCol = null

      productTagsHasStartDate = await schema.hasColumn('product_tags', 'start_date')
      productTagsHasEndDate = await schema.hasColumn('product_tags', 'end_date')
      productTagsHasCreatedAt = await schema.hasColumn('product_tags', 'created_at')
      productTagsHasUpdatedAt = await schema.hasColumn('product_tags', 'updated_at')
      productTagsHasDeletedAt = await schema.hasColumn('product_tags', 'deleted_at')
    }

    // ===== product_concerns =====
    const hasProductConcernsTable = await schema.hasTable('product_concerns')
    let productConcernsOptionCol: string | null = null
    let productConcernsHasCreatedAt = false
    let productConcernsHasUpdatedAt = false
    let productConcernsHasDeletedAt = false

    if (hasProductConcernsTable) {
      const candidates = [
        'concern_option_id',
        'concern_options_id',
        'concern_option_ids',
        'concern_options_ids',
      ]
      for (const c of candidates) {
        if (await schema.hasColumn('product_concerns', c)) {
          productConcernsOptionCol = c
          break
        }
      }

      productConcernsHasCreatedAt = await schema.hasColumn('product_concerns', 'created_at')
      productConcernsHasUpdatedAt = await schema.hasColumn('product_concerns', 'updated_at')
      productConcernsHasDeletedAt = await schema.hasColumn('product_concerns', 'deleted_at')
    }

    this.cached = {
      hasProductTagsTable,
      productTagsTagCol,
      productTagsHasStartDate,
      productTagsHasEndDate,
      productTagsHasCreatedAt,
      productTagsHasUpdatedAt,
      productTagsHasDeletedAt,

      hasProductConcernsTable,
      productConcernsOptionCol,
      productConcernsHasCreatedAt,
      productConcernsHasUpdatedAt,
      productConcernsHasDeletedAt,
    }

    return this.cached
  }
}
