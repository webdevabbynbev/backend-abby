import ProductMedia from '#models/product_media'

export default class ProductMediaSyncer {
  async sync(productId: number, urls: string[] = [], altText: string | null, trx: any): Promise<number> {
    const uniqUrls = Array.from(
      new Set((urls || []).map((u) => String(u || '').trim()).filter(Boolean))
    )
    if (!uniqUrls.length) return 0

    const existing = await ProductMedia.query({ client: trx })
      .where('product_id', productId)
      .whereIn('url', uniqUrls)
      .select(['url'])

    const existingSet = new Set(existing.map((m: any) => String(m.url)))
    const toInsert = uniqUrls.filter((u) => !existingSet.has(u))
    if (!toInsert.length) return 0

    await ProductMedia.createMany(
      toInsert.map((u) => ({
        productId,
        url: u,
        altText: altText || null,
        type: 1 as any,
      })) as any,
      { client: trx }
    )

    return toInsert.length
  }
}
