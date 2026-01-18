import TagLookup from '#services/product_csv_import/lookups/tag_lookup'
import type { PivotMeta } from '#services/product_csv_import/pivot_meta_service'

export default class ProductTagSyncer {
  constructor(private tags: TagLookup) {}

  async sync(
    productId: number,
    tagText: string,
    pivot: PivotMeta,
    nowSql: string | null,
    trx: any
  ): Promise<number> {
    if (!pivot.hasProductTagsTable || !pivot.productTagsTagCol) return 0

    await trx.from('product_tags').where('product_id', productId).del()

    const tagIds = await this.tags.getIds(tagText || '', trx)
    const uniqTagIds = Array.from(new Set(tagIds))

    let attached = 0
    for (const tagId of uniqTagIds) {
      const payload: any = {
        product_id: productId,
        [pivot.productTagsTagCol]: tagId,
      }

      if (pivot.productTagsHasStartDate) payload.start_date = null
      if (pivot.productTagsHasEndDate) payload.end_date = null
      if (pivot.productTagsHasDeletedAt) payload.deleted_at = null
      if (pivot.productTagsHasCreatedAt) payload.created_at = nowSql
      if (pivot.productTagsHasUpdatedAt) payload.updated_at = nowSql

      await trx.insertQuery().table('product_tags').insert(payload)
      attached += 1
    }

    return attached
  }
}
