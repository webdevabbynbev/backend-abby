import ProductOnline from '#models/product_online'
import { applyDetailPreloads, applyListPreloads } from '#services/frontend/products/public_product_preloads'

export type PublicProductListParams = {
  name: string
  categoryTypeIds: Array<number | string>
  isFlashSale: 0 | 1 | null
  sortBy: string
  sortType: 'ASC' | 'DESC'
  page: number
  perPage: number
  nowStr: string
  includeReviews: boolean
}

export async function listOnlineProducts(params: PublicProductListParams) {
  const q = ProductOnline.query()
    .where('product_onlines.is_active', true)
    .join('products', 'products.id', '=', 'product_onlines.product_id')
    .if(params.name, (qq) => qq.where('products.name', 'like', `%${params.name}%`))
    .if(params.categoryTypeIds.length, (qq) =>
      qq.whereIn('products.category_type_id', params.categoryTypeIds)
    )

  if (params.isFlashSale !== null) {
    q.where('products.is_flash_sale', params.isFlashSale)
  }

  const direction = params.sortType === 'DESC' ? 'desc' : 'asc'

  return q
    .preload('product', (qq) => applyListPreloads(qq, params.nowStr, params.includeReviews))
    .orderBy(`products.${params.sortBy}`, direction)
    .paginate(params.page, params.perPage)
}

export async function getOnlineProductByPath(path: string, nowStr: string) {
  return ProductOnline.query()
    .where('product_onlines.is_active', true)
    .join('products', 'products.id', '=', 'product_onlines.product_id')
    .where((q) => q.where('products.path', path).orWhere('products.slug', path))
    .preload('product', (qq) => applyDetailPreloads(qq, nowStr))
    .first()
}
