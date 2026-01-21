import ConcernLookup from '#services/product_csv_import/lookups/concern_lookup'
import type { PivotMeta } from '#services/product_csv_import/pivot_meta_service'
import { splitList } from '#services/product_csv_import/csv_value_utils'

export default class ProductConcernSyncer {
  constructor(private concerns: ConcernLookup) {}

  async sync(
    productId: number,
    concernText: string,
    subConcernText: string,
    pivot: PivotMeta,
    trx: any
  ): Promise<number> {
    if (!pivot.hasProductConcernsTable || !pivot.productConcernsOptionCol) return 0

    await trx.from('product_concerns').where('product_id', productId).delete()

    const concernNames = splitList(concernText || '')
    const uniqConcernNames = Array.from(new Set(concernNames.map((x) => x.trim()).filter(Boolean)))

    let attached = 0
    for (const cName of uniqConcernNames) {
      const optionIds = await this.concerns.getOptionIds(cName, subConcernText || '', trx)
      const uniqOptIds = Array.from(new Set(optionIds))

      for (const optId of uniqOptIds) {
        const payload: any = {
          product_id: productId,
          [pivot.productConcernsOptionCol]: optId,
        }
        await trx.insertQuery().table('product_concerns').insert(payload)
        attached += 1
      }
    }

    return attached
  }
}
