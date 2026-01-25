import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

import Brand from '#models/brand'
import Product from '#models/product'
import ProductVariant from '#models/product_variant'

function toInt(v: any, fallback: number) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function parseIds(input: any): number[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .flatMap((x) => String(x).split(','))
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0)
      )
    )
  }

  const s = String(input).trim()
  if (!s) return []
  return Array.from(
    new Set(
      s
        .split(',')
        .map((x) => Number(String(x).trim()))
        .filter((x) => Number.isFinite(x) && x > 0)
    )
  )
}

function buildVariantLabel(v: any) {
  const attrs = Array.isArray(v?.attributes) ? v.attributes : []
  const parts = attrs
    .map((av: any) => {
      const an = av?.attribute?.name ? String(av.attribute.name).trim() : ''
      const vv = av?.value ? String(av.value).trim() : ''
      return an && vv ? `${an}: ${vv}` : vv || an
    })
    .filter(Boolean)

  const sku = v?.sku ? String(v.sku).trim() : ''
  const base = sku || `VAR-${v?.id}`
  return `${base}${parts.length ? ` - ${parts.join(' / ')}` : ''}`
}

export default class DiscountOptionsController {
  public async brands({ request, response }: HttpContext) {
    try {
      const qs = request.qs()
      const q = String(qs.q ?? '').trim()
      const page = toInt(qs.page, 1) || 1
      const perPage = toInt(qs.per_page, 20) || 20

      const rows = await Brand.query()
        .whereNull('deleted_at')
        .if(q, (query) => query.whereILike('name', `%${q}%`))
        .orderBy('name', 'asc')
        .paginate(page, perPage)

      const json = rows.toJSON()
      const data = (json.data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
      }))

      return response.ok({ message: 'success', serve: { data, ...json.meta } })
    } catch (e: any) {
      return response.status(500).send({ message: e?.message || 'Internal Server Error', serve: null })
    }
  }

  public async products({ request, response }: HttpContext) {
    try {
      const qs = request.qs()
      const q = String(qs.q ?? '').trim()
      const page = toInt(qs.page, 1) || 1
      const perPage = toInt(qs.per_page, 20) || 20

      const rows = await Product.query()
        .whereNull('deleted_at')
        .if(q, (query) => {
          query.where((sub) => {
            sub
              .whereILike('products.name', `%${q}%`)
              .orWhereILike('products.slug', `%${q}%`)
              .orWhereILike('products.master_sku', `%${q}%`)
          })
        })
        .select(['id', 'name', 'brand_id'])
        .orderBy('name', 'asc')
        .paginate(page, perPage)

      const json = rows.toJSON()
      const data = (json.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        brandId: p.brandId ?? p.brand_id ?? null,
      }))

      return response.ok({ message: 'success', serve: { data, ...json.meta } })
    } catch (e: any) {
      return response.status(500).send({ message: e?.message || 'Internal Server Error', serve: null })
    }
  }

  public async variants({ request, response }: HttpContext) {
    try {
      const qs = request.qs()
      const q = String(qs.q ?? '').trim()
      const page = toInt(qs.page, 1) || 1
      const perPage = toInt(qs.per_page, 20) || 20
      const offset = (page - 1) * perPage

      const base = db
        .from('attribute_values as av')
        .leftJoin('attributes as a', 'a.id', 'av.attribute_id')
        .whereNull('av.deleted_at')
        .select('av.id', 'av.value', db.raw('a.name as attributeName'))
        .orderBy('a.name', 'asc')
        .orderBy('av.value', 'asc')

      if (q) {
        base.andWhere((sub) => {
          sub.whereILike('av.value', `%${q}%`).orWhereILike('a.name', `%${q}%`)
        })
      }

      const data = await base.clone().limit(perPage).offset(offset)

      const countRow = await db
        .from('attribute_values as av')
        .leftJoin('attributes as a', 'a.id', 'av.attribute_id')
        .whereNull('av.deleted_at')
        .if(q, (query) => {
          query.andWhere((sub) => {
            sub.whereILike('av.value', `%${q}%`).orWhereILike('a.name', `%${q}%`)
          })
        })
        .count('* as total')
        .first()

      const total = Number(countRow?.total ?? 0)
      const lastPage = perPage > 0 ? Math.ceil(total / perPage) : 1

      return response.ok({
        message: 'success',
        serve: {
          data,
          total,
          perPage,
          currentPage: page,
          lastPage,
        },
      })
    } catch (e: any) {
      return response.status(500).send({ message: e?.message || 'Internal Server Error', serve: null })
    }
  }

  public async productVariants({ request, response }: HttpContext) {
    try {
      const qs = request.qs()

      const ids = parseIds(qs.ids ?? qs.variant_ids ?? request.input('ids') ?? request.input('variant_ids'))
      const productId = toInt(qs.product_id ?? request.input('product_id'), 0)
      const q = String(qs.q ?? '').trim()

      if (ids.length) {
        const capped = ids.slice(0, 500)

        const variants = await ProductVariant.query()
          .whereNull('deleted_at')
          .whereIn('id', capped)
          .preload('attributes', (q2) => {
            q2.whereNull('deleted_at').preload('attribute')
          })
          .orderBy('id', 'asc')

        const data = variants.map((v: any) => ({
          product_variant_id: v.id,
          product_id: v.productId ?? v.product_id ?? null,
          sku: v.sku ?? null,
          price: Number(v.price ?? 0),
          stock: Number(v.stock ?? 0),
          label: buildVariantLabel(v),
        }))

        return response.ok({ message: 'success', serve: { data } })
      }

      if (!productId) {
        return response.badRequest({
          message: 'product_id is required (or provide ids=1,2,3)',
          serve: null,
        })
      }

      const variantsQuery = ProductVariant.query()
        .whereNull('deleted_at')
        .where('product_id', productId)
        .if(q, (query) => {
          query.where((sub) => {
            sub.whereILike('sku', `%${q}%`)
          })
        })
        .preload('attributes', (q2) => {
          q2.whereNull('deleted_at').preload('attribute')
        })
        .orderBy('id', 'asc')

      const variants = await variantsQuery

      const data = variants.map((v: any) => ({
        product_variant_id: v.id,
        product_id: v.productId ?? v.product_id ?? null,
        sku: v.sku ?? null,
        price: Number(v.price ?? 0),
        stock: Number(v.stock ?? 0),
        label: buildVariantLabel(v),
      }))

      return response.ok({ message: 'success', serve: { data } })
    } catch (e: any) {
      return response.status(500).send({ message: e?.message || 'Internal Server Error', serve: null })
    }
  }
}
