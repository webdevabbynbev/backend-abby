import type { HttpContext } from '@adonisjs/core/http'
import Sale from '#models/sale'
import { createSaleValidator, updateSaleValidator } from '#validators/sale'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import emitter from '@adonisjs/core/services/emitter'
import { DiscountConflictService } from '#services/promo/discount_conflict_service'
import { PromoPivotService } from '#services/promo/promo_pivot_service'
import { uniqPositiveInts } from '#utils/ids'

type ConflictGuard = {
  status: number
  payload: {
    message: string
    serve: {
      code: 'DISCOUNT_CONFLICT'
      productIds: number[]
      discountIds: number[]
    }
  }
}

export default class SalesController {
  private discountConflict = new DiscountConflictService()
  private pivot = new PromoPivotService()
  private async fetchFreshSaleWithRelations(saleId: number) {
    const sale = await Sale.find(saleId)
    if (!sale) return null

    // 1) Coba ambil variants pivot (mode utama sekarang)
    const rawVariants = await db
      .from('sale_variants')
      .join('product_variants', 'sale_variants.product_variant_id', 'product_variants.id')
      .leftJoin('products', 'product_variants.product_id', 'products.id')
      .where('sale_variants.sale_id', saleId)
      .select(
        'product_variants.*',
        'products.name as product_name',
        'sale_variants.sale_price as pivot_sale_price',
        'sale_variants.stock as pivot_stock'
      )

    // 2) Ambil products pivot (legacy) sebagai fallback kalau variants kosong
    const rawProducts = await db
      .from('sale_products')
      .join('products', 'sale_products.product_id', 'products.id')
      .where('sale_products.sale_id', saleId)
      .select(
        'products.*',
        'sale_products.sale_price as pivot_sale_price',
        'sale_products.stock as pivot_stock'
      )

    const saleJson: any = sale.toJSON()

    // Kalau ada variants, prioritaskan variants dan kosongkan products legacy
    if (rawVariants.length > 0) {
      saleJson.variants = rawVariants.map((row: any) => ({
        // data master variant
        id: row.id,
        sku: row.sku,
        price: row.price,
        stock: row.stock,
        product_id: row.product_id,

        // object product (untuk UI)
        product: row.product_id
          ? {
              id: row.product_id,
              name: row.product_name,
            }
          : null,

        // pivot
        pivot: {
          sale_price: row.pivot_sale_price,
          stock: row.pivot_stock,
        },

        // fallback flat (biar frontend “pasti ketemu”)
        sale_price: row.pivot_sale_price,
        sale_stock: row.pivot_stock,
      }))

      saleJson.products = []
      return saleJson
    }

    // Kalau variants kosong tapi products legacy ada
    if (rawProducts.length > 0) {
      saleJson.products = rawProducts.map((row: any) => ({
        // data master product
        id: row.id,
        name: row.name,
        slug: row.slug,
        sku: row.sku,
        price: row.price,
        stock: row.stock,

        // pivot
        pivot: {
          sale_price: row.pivot_sale_price,
          stock: row.pivot_stock,
        },

        // fallback flat
        sale_price: row.pivot_sale_price,
        sale_stock: row.pivot_stock,
      }))

      saleJson.variants = []
      return saleJson
    }

    // Kalau dua-duanya kosong
    saleJson.variants = saleJson.variants ?? []
    saleJson.products = saleJson.products ?? []
    return saleJson
  }

  private async assertNoAutoDiscountConflict(
    trx: any,
    willBePublished: boolean,
    productIds: number[],
    promoStart: DateTime,
    promoEnd: DateTime
  ): Promise<ConflictGuard | null> {
    if (!willBePublished || !productIds.length) return null

    const conflicts = await this.discountConflict.findDiscountConflictsForProducts(
      trx,
      productIds,
      promoStart,
      promoEnd
    )

    if (!conflicts.productIds.length) return null

    return {
      status: 409,
      payload: {
        message: 'Produk sedang ikut Discount (auto) pada periode tersebut. Tidak bisa dimasukkan ke Sale.',
        serve: {
          code: 'DISCOUNT_CONFLICT',
          productIds: conflicts.productIds,
          discountIds: conflicts.discountIds,
        },
      },
    }
  }

  private uniq(nums: number[]) {
    return Array.from(new Set((nums || []).filter(Boolean)))
  }

  private async productIdsFromVariantIds(trx: any, variantIds: number[]): Promise<number[]> {
    const ids = uniqPositiveInts(variantIds || [])
    if (!ids.length) return []
    const rows = await trx.from('product_variants').whereIn('id', ids).select('product_id')
    return uniqPositiveInts(rows.map((r: any) => r.product_id))
  }

  private async getSaleVariantIds(trx: any, saleId: number): Promise<number[]> {
    const rows = await trx.from('sale_variants').where('sale_id', saleId).select('product_variant_id')
    return uniqPositiveInts(rows.map((r: any) => r.product_variant_id))
  }

  public async get({ response }: HttpContext) {
    const sales = await Sale.query().orderBy('start_datetime', 'desc')

    const hydrated = await Promise.all(
      sales.map((sale) => this.fetchFreshSaleWithRelations(sale.id))
    )

    const data = hydrated.filter((item) => item !== null)

    return response.status(200).send({ message: 'Success', serve: data })
  }

  public async show({ params, response }: HttpContext) {
    // Pakai helper manual agar tidak kena kasus preload kosong
    const sale = await this.fetchFreshSaleWithRelations(Number(params.id))

    if (!sale) return response.status(404).send({ message: 'Sale not found', serve: null })
    return response.status(200).send({ message: 'Success', serve: sale })
  }

  public async create({ request, response, auth }: HttpContext) {
    const payload: any = await request.validateUsing(createSaleValidator)
    const trx = await db.transaction()

    try {
      const promoStart = DateTime.fromJSDate(payload.start_datetime).setZone('Asia/Jakarta')
      const promoEnd = DateTime.fromJSDate(payload.end_datetime).setZone('Asia/Jakarta')
      const willBePublished = payload.is_publish ?? false

      const variantsProvided = Array.isArray(payload.variants) && payload.variants.length > 0
      const productsProvided = Array.isArray(payload.products) && payload.products.length > 0

      if (!variantsProvided && !productsProvided) {
        await trx.rollback()
        return response.status(422).send({ message: 'variants or products is required', serve: null })
      }

      // conflict guard butuh productIds
      let requestedProductIds: number[] = []
      if (variantsProvided) {
        const requestedVariantIds = uniqPositiveInts((payload.variants || []).map((v: any) => v.variant_id))
        requestedProductIds = await this.productIdsFromVariantIds(trx, requestedVariantIds)
      } else {
        requestedProductIds = uniqPositiveInts((payload.products || []).map((p: any) => p.product_id))
      }

      const guard = await this.assertNoAutoDiscountConflict(
        trx,
        willBePublished,
        requestedProductIds,
        promoStart,
        promoEnd
      )
      if (guard) {
        await trx.rollback()
        return response.status(guard.status).send(guard.payload)
      }

      const sale = await Sale.create(
        {
          title: payload.title,
          description: payload.description,
          hasButton: payload.has_button,
          buttonText: payload.button_text,
          buttonUrl: payload.button_url,
          startDatetime: DateTime.fromJSDate(payload.start_datetime),
          endDatetime: DateTime.fromJSDate(payload.end_datetime),
          isPublish: willBePublished,
          createdBy: auth.user?.id,
          updatedBy: auth.user?.id,
        },
        { client: trx }
      )

      if (variantsProvided) {
        const nowSql = DateTime.now().toSQL()
        const rows = (payload.variants || []).map((v: any) => ({
          sale_id: sale.id,
          product_variant_id: v.variant_id,
          sale_price: v.sale_price,
          stock: v.stock,
          created_at: nowSql,
          updated_at: nowSql,
        }))

        await trx.from('sale_variants').where('sale_id', sale.id).delete()
        if (rows.length) await trx.table('sale_variants').multiInsert(rows)

        // bersihin legacy pivot biar gak dobel sumber data
        await trx.from('sale_products').where('sale_id', sale.id).delete()
      } else {
        const rows = (payload.products || []).map((p: any) => ({
          sale_id: sale.id,
          product_id: p.product_id,
          sale_price: p.sale_price,
          stock: p.stock,
        }))

        await this.pivot.replacePromoProducts(trx, 'sale_products', 'sale_id', sale.id, rows)

        // bersihin variant pivot kalau ada
        await trx.from('sale_variants').where('sale_id', sale.id).delete()
      }

      await trx.commit()

      // Fetch lengkap untuk response (tanpa mengubah alur kondisi create)
      const freshSale = await this.fetchFreshSaleWithRelations(sale.id)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Sale ${sale.title}`,
        menu: 'Sale',
        data: freshSale ?? sale.toJSON(),
      })

      return response
        .status(201)
        .send({ message: 'Sale created successfully', serve: freshSale ?? sale })
    } catch (error: any) {
      await trx.rollback()
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async update({ params, request, response, auth }: HttpContext) {
    const payload: any = await request.validateUsing(updateSaleValidator)

    const sale = await Sale.find(params.id)
    if (!sale) return response.status(404).send({ message: 'Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = sale.toJSON()

      const oldProductIdsFromProducts = await this.pivot.getPromoProductIds(trx, 'sale_products', 'sale_id', sale.id)
      const oldVariantIds = await this.getSaleVariantIds(trx, sale.id)
      const oldProductIdsFromVariants = await this.productIdsFromVariantIds(trx, oldVariantIds)

      const newStart = payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : sale.startDatetime
      const newEnd = payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : sale.endDatetime
      const willBePublished = payload.is_publish ?? sale.isPublish

      const variantsProvided = payload.variants !== undefined
      const productsProvided = payload.products !== undefined

      // ids untuk conflict guard
      let guardProductIds: number[] = []
      if (variantsProvided) {
        const newVariantIds = uniqPositiveInts((payload.variants || []).map((v: any) => v.variant_id))
        guardProductIds = await this.productIdsFromVariantIds(trx, newVariantIds)
      } else if (productsProvided) {
        guardProductIds = uniqPositiveInts((payload.products || []).map((p: any) => p.product_id))
      } else {
        guardProductIds = this.uniq([...(oldProductIdsFromProducts || []), ...(oldProductIdsFromVariants || [])])
      }

      const guard = await this.assertNoAutoDiscountConflict(
        trx,
        willBePublished,
        guardProductIds,
        newStart.setZone('Asia/Jakarta'),
        newEnd.setZone('Asia/Jakarta')
      )
      if (guard) {
        await trx.rollback()
        return response.status(guard.status).send(guard.payload)
      }

      sale.merge({
        title: payload.title ?? sale.title,
        description: payload.description ?? sale.description,
        hasButton: payload.has_button ?? sale.hasButton,
        buttonText: payload.button_text ?? sale.buttonText,
        buttonUrl: payload.button_url ?? sale.buttonUrl,
        startDatetime: payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : sale.startDatetime,
        endDatetime: payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : sale.endDatetime,
        isPublish: willBePublished,
        updatedBy: auth.user?.id,
      })

      await sale.useTransaction(trx).save()

      if (variantsProvided) {
        const nowSql = DateTime.now().toSQL()
        const rows = (payload.variants || []).map((v: any) => ({
          sale_id: sale.id,
          product_variant_id: v.variant_id,
          sale_price: v.sale_price,
          stock: v.stock,
          created_at: nowSql,
          updated_at: nowSql,
        }))

        await trx.from('sale_variants').where('sale_id', sale.id).delete()
        if (rows.length) await trx.table('sale_variants').multiInsert(rows)

        await trx.from('sale_products').where('sale_id', sale.id).delete()
      } else if (productsProvided) {
        const rows = (payload.products || []).map((p: any) => ({
          sale_id: sale.id,
          product_id: p.product_id,
          sale_price: p.sale_price,
          stock: p.stock,
        }))

        await this.pivot.replacePromoProducts(trx, 'sale_products', 'sale_id', sale.id, rows)
        await trx.from('sale_variants').where('sale_id', sale.id).delete()
      }

      await trx.commit()

      // Fetch lengkap untuk response (tanpa mengubah alur kondisi update)
      const freshSale = await this.fetchFreshSaleWithRelations(sale.id)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Sale ${oldData.title}`,
        menu: 'Sale',
        data: { old: oldData, new: freshSale ?? sale.toJSON() },
      })

      return response.status(200).send({ message: 'Sale updated successfully', serve: freshSale ?? sale })
    } catch (error: any) {
      await trx.rollback()
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async delete({ params, response, auth }: HttpContext) {
    const sale = await Sale.find(params.id)
    if (!sale) return response.status(404).send({ message: 'Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = sale.toJSON()

      await trx.from('sale_products').where('sale_id', sale.id).delete()
      await trx.from('sale_variants').where('sale_id', sale.id).delete()
      await sale.useTransaction(trx).delete()

      await trx.commit()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Delete Sale ${oldData.title}`,
        menu: 'Sale',
        data: oldData,
      })

      return response.status(200).send({ message: 'Sale deleted successfully', serve: true })
    } catch (error: any) {
      await trx.rollback()
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }
}