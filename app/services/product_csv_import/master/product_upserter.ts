import Product from '#models/product'
import { mapStatus, slugify } from '#services/product_csv_import/csv_value_utils'
import UniqueSlugService from '#services/product_csv_import/unique_slug_service'

export default class ProductUpserter {
  constructor(private uniqueSlug = new UniqueSlugService()) {}

  async upsert(
    g: any,
    deps: { categoryTypeId: number; brandId?: number },
    trx: any
  ): Promise<{ product: any; created: boolean }> {
    let product: any = null

    if (g.masterSku) {
      product = await Product.query({ client: trx }).where('master_sku', g.masterSku).first()
    }
    if (!product) {
      product = await Product.query({ client: trx }).where('name', g.productName).first()
    }

    if (product) {
      product.name = g.productName
      product.basePrice = g.basePrice || 0
      product.categoryTypeId = Number(deps.categoryTypeId)
      if (deps.brandId) product.brandId = deps.brandId
      product.status = mapStatus(g.statusProduk) as any
      if (g.howToUse) product.howToUse = g.howToUse

      await product.save()
      return { product, created: false }
    }

    const baseSlug = slugify(g.productName) || 'product'
    const unique = await this.uniqueSlug.ensureUniqueSlug('products', baseSlug, trx)

    product = await Product.create(
      {
        name: g.productName,
        slug: unique,
        masterSku: g.masterSku || null,
        description: null,
        howToUse: g.howToUse || null,
        basePrice: g.basePrice || 0,
        weight: 0,
        isFlashSale: false,
        status: mapStatus(g.statusProduk),
        categoryTypeId: Number(deps.categoryTypeId),
        brandId: deps.brandId,
      } as any,
      { client: trx }
    )

    return { product, created: true }
  }
}
