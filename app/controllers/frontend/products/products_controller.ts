import type { HttpContext } from '@adonisjs/core/http'

import {
  SORT_DIR_MAP,
  SORT_FIELD_MAP,
  clamp,
  normalizeWildcardPath,
  nowWibSqlString,
  parseBoolish,
  parseBoolishToInt,
  parseCsvIds,
  toInt,
} from '#services/frontend/products/public_product_params'

import { buildVariantItems } from '#services/frontend/products/public_product_presenter'
import { discountPricingService } from '#services/frontend/products/public_product_pricing'
import {
  getOnlineProductByPath,
  listOnlineProducts,
} from '#services/frontend/products/public_product_repository'
import { fail, ok } from '#utils/http_response'

export default class ProductsController {
  public async get({ response, request }: HttpContext) {
    try {
      const qs = request.qs()

      const name = String(qs.name || '').trim()
      const categoryTypeIds = parseCsvIds(qs.category_type)
      const isFlashSale = parseBoolishToInt(qs.is_flash_sale) // 0|1|null
      const includeReviews = parseBoolish(qs.include_reviews)

      const sortBy = SORT_FIELD_MAP[String(qs.field || 'position')] || 'position'
      const sortType = SORT_DIR_MAP[String(qs.value || 'ASC')] || 'ASC'

      const page = clamp(toInt(qs.page, 1), 1, 1_000_000)
      const perPage = clamp(toInt(qs.per_page, 10), 1, 100)

      const nowStr = nowWibSqlString()

      const productsQuery = await listOnlineProducts({
        name,
        categoryTypeIds,
        isFlashSale,
        sortBy,
        sortType,
        page,
        perPage,
        nowStr,
        includeReviews,
      })

      const rows = productsQuery.all()
      const products = (rows as any[]).map((row) => row?.product).filter(Boolean)
      if (products.length) {
        await discountPricingService.attachExtraDiscount(products as any[])
      }

      const { meta, data } = productsQuery.serialize()
      const extraById = new Map<string, any>()

      for (const row of rows as any[]) {
        const product = row?.product
        const productId = product?.id
        const extra = product?.extraDiscount ?? null
        if (!productId) continue
        if (extra) extraById.set(String(productId), extra)
      }

      const withExtra = (data as any[]).map((row) => {
        const product = row?.product
        const productId = product?.id
        if (!productId) return row
        const extra = extraById.get(String(productId))
        if (!extra) return row
        return {
          ...row,
          extraDiscount: extra,
          product: { ...product, extraDiscount: extra },
        }
      })

      return ok(response, { data: withExtra, ...meta })
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }

  public async show({ response, params }: HttpContext) {
    try {
      const path = normalizeWildcardPath(params['*'])
      if (!path) return fail(response, 400, 'Missing product path')

      const nowStr = nowWibSqlString()
      const productOnline = await getOnlineProductByPath(path, nowStr)

      if (!productOnline?.product) return fail(response, 404, 'Product not found')

      const p = productOnline.product.toJSON()
      await discountPricingService.attachExtraDiscount([p as any])

      return ok(response, { ...p, variantItems: buildVariantItems(p) })
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }
}