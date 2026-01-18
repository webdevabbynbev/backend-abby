import { DateTime } from 'luxon'
import ProductOnline from '#models/product_online'

export default class ProductOnlineEnsurer {
  async ensure(productId: number, trx: any): Promise<boolean> {
    const existing = await ProductOnline.query({ client: trx }).where('product_id', productId).first()
    if (existing) return false

    await ProductOnline.create(
      { productId, isActive: true, publishedAt: DateTime.now() as any } as any,
      { client: trx }
    )
    return true
  }
}
