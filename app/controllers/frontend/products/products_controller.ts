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

import db from '@adonisjs/lucid/services/db'
import Sale from '#models/sale'

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

      // 1) ambil JSON product (sudah ada variants)
      const p = productOnline.product.toJSON()

      // 2) attach extra discount ke product (kalau ada)
      await discountPricingService.attachExtraDiscount([p as any])

      // 3) attach SALE price per variant (mutate p.variants) — HARUS sebelum buildVariantItems
      try {
        const activeSale = await Sale.query()
          .where('is_publish', 1 as any)
          .where('start_datetime', '<=', nowStr)
          .where('end_datetime', '>=', nowStr)
          .orderBy('start_datetime', 'desc')
          .first()

        if (activeSale && Array.isArray((p as any)?.variants) && (p as any).variants.length) {
          const variants = (p as any).variants as any[]
          const variantIds = variants.map((v) => Number(v?.id)).filter(Boolean)

          if (variantIds.length) {
            const rows = await db
              .from('sale_variants')
              .where('sale_id', activeSale.id)
              .whereIn('product_variant_id', variantIds)
              .select('product_variant_id', 'sale_price', 'stock')

            const byVariant = new Map<number, { salePrice: number; saleStock: number }>()
            for (const r of rows as any[]) {
              byVariant.set(Number(r.product_variant_id), {
                salePrice: Number(r.sale_price ?? 0),
                saleStock: Number(r.stock ?? 0),
              })
            }

            ;(p as any).variants = variants.map((v) => {
              const promo = byVariant.get(Number(v?.id))
              return {
                ...v,
                salePrice: promo?.salePrice ?? 0,
                saleStock: promo?.saleStock ?? 0,
              }
            })
          }
        }
      } catch (e) {
        console.error('attachSaleVariantPricing failed', e)
      }

      // 4) baru build variantItems (sekarang sudah lihat salePrice)
      const variantItems = buildVariantItems(p)

      // 5) return
      return ok(response, { ...p, variantItems })
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }
}