import type { HttpContext } from '@adonisjs/core/http'
import FlashSale from '#models/flashsale'
import { createFlashSaleValidator, updateFlashSaleValidator } from '#validators/flashsale'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import emitter from '@adonisjs/core/services/emitter'
import { PromoFlagService } from '#services/promo/promo_flag_service'
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

export default class FlashsalesController {
  private promoFlag = new PromoFlagService()
  private discountConflict = new DiscountConflictService()
  private pivot = new PromoPivotService()
  private async buildVariantLabelMap(variantIds: number[]) {
    const ids = uniqPositiveInts(variantIds || [])
    const map = new Map<number, string[]>()
    if (!ids.length) return map

    const rows = await db
      .from('attribute_values as av')
      .whereIn('av.product_variant_id', ids)
      .orderBy('av.product_variant_id', 'asc')
      .orderBy('av.attribute_id', 'asc')
      .select(['av.product_variant_id', 'av.attribute_id', 'av.value'])

    const seen = new Map<number, Set<string>>()
    for (const r of rows as any[]) {
      const pvId = Number(r.product_variant_id ?? 0)
      if (!pvId) continue

      const val = String(r.value ?? '').trim()
      if (!val) continue

      if (!seen.has(pvId)) seen.set(pvId, new Set<string>())
      const set = seen.get(pvId)!
      if (set.has(val)) continue
      set.add(val)

      const arr = map.get(pvId) ?? []
      arr.push(val)
      map.set(pvId, arr)
    }

    return map
  }

  // ===========================================================================
  // HELPER: MANUAL FETCH (AVOID PRELOAD SOMETIMES EMPTY)
  // - Support 2 modes: variants (flashsale_variants) or legacy products (flashsale_products)
  // - Format pivot for frontend (pivot + flat fallback)
  // ===========================================================================
  private async fetchFreshFlashSaleWithRelations(flashSaleId: number) {
    const flashSale = await FlashSale.find(flashSaleId)
    if (!flashSale) return null

    // 1) Variants pivot (primary mode)
    const rawVariants = await db
      .from('flashsale_variants')
      .join('product_variants', 'flashsale_variants.product_variant_id', 'product_variants.id')
      .leftJoin('products', 'product_variants.product_id', 'products.id')
      .where('flashsale_variants.flash_sale_id', flashSaleId)
      .select(
        'product_variants.*',
        'products.name as product_name',
        'flashsale_variants.flash_price as pivot_flash_price',
        'flashsale_variants.stock as pivot_stock'
      )

    // 2) Legacy products pivot (fallback)
    const rawProducts = await db
      .from('flashsale_products')
      .join('products', 'flashsale_products.product_id', 'products.id')
      .where('flashsale_products.flash_sale_id', flashSaleId)
      .select(
        'products.*',
        'flashsale_products.flash_price as pivot_flash_price',
        'flashsale_products.stock as pivot_stock'
      )

    const flashSaleJson: any = flashSale.toJSON()

    if (rawVariants.length > 0) {
      const labelMap = await this.buildVariantLabelMap(
        rawVariants.map((row: any) => Number(row?.id ?? row?.product_variant_id ?? 0))
      )

      flashSaleJson.variants = rawVariants.map((row: any) => ({
        // variant master data
        id: row.id,
        sku: row.sku,
        price: row.price,
        stock: row.stock,
        product_id: row.product_id,
        label:
          (labelMap.get(Number(row.id ?? row.product_variant_id ?? 0)) ?? []).join(' / ') ||
          row.sku ||
          `VAR-${row.id}`,

        // product object (for UI)
        product: row.product_id
          ? {
              id: row.product_id,
              name: row.product_name,
            }
          : null,

        // pivot
        pivot: {
          flash_price: row.pivot_flash_price,
          stock: row.pivot_stock,
        },

        // flat fallback
        flash_price: row.pivot_flash_price,
        flash_stock: row.pivot_stock,
      }))

      flashSaleJson.products = []
      return flashSaleJson
    }

    if (rawProducts.length > 0) {
      flashSaleJson.products = rawProducts.map((row: any) => ({
        // product master data
        id: row.id,
        name: row.name,
        slug: row.slug,
        sku: row.sku,
        price: row.price,
        stock: row.stock,

        // pivot
        pivot: {
          flash_price: row.pivot_flash_price,
          stock: row.pivot_stock,
        },

        // flat fallback
        flash_price: row.pivot_flash_price,
        flash_stock: row.pivot_stock,
      }))

      flashSaleJson.variants = []
      return flashSaleJson
    }

    flashSaleJson.variants = flashSaleJson.variants ?? []
    flashSaleJson.products = flashSaleJson.products ?? []
    return flashSaleJson
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
        message:
          'Produk sedang ada dalam diskon pada periode tersebut. Tidak bisa dimasukkan ke Flash Sale.',
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

  private async getFlashsaleVariantIds(trx: any, flashSaleId: number): Promise<number[]> {
    const rows = await trx
      .from('flashsale_variants')
      .where('flash_sale_id', flashSaleId)
      .select('product_variant_id')
    return uniqPositiveInts(rows.map((r: any) => r.product_variant_id))
  }

  private async replaceFlashsaleVariants(
    trx: any,
    flashSaleId: number,
    rows: Array<Record<string, any>>
  ): Promise<number[]> {
    await trx.from('flashsale_variants').where('flash_sale_id', flashSaleId).delete()
    if (!rows?.length) return []
    const schema = (trx?.schema ?? (db as any).connection().schema) as any
    const hasCreatedAt = await schema?.hasColumn?.('flashsale_variants', 'created_at')
    const hasUpdatedAt = await schema?.hasColumn?.('flashsale_variants', 'updated_at')
    const nowSql = DateTime.now().toSQL()
    const stampedRows =
      hasCreatedAt || hasUpdatedAt
        ? rows.map((row) => ({
            ...row,
            ...(hasCreatedAt ? { created_at: row.created_at ?? nowSql } : {}),
            ...(hasUpdatedAt ? { updated_at: row.updated_at ?? nowSql } : {}),
          }))
        : rows

    await trx.table('flashsale_variants').multiInsert(stampedRows)
    return uniqPositiveInts(rows.map((r: any) => r.product_variant_id))
  }

  public async get({ response }: HttpContext) {
    const flashSales = await FlashSale.query().orderBy('start_datetime', 'desc')

    const hydrated = await Promise.all(
      flashSales.map((flashSale) => this.fetchFreshFlashSaleWithRelations(flashSale.id))
    )

    const data = hydrated.filter((item) => item !== null)

    return response.status(200).send({ message: 'Success', serve: data })
  }

  public async show({ params, response }: HttpContext) {
    const flashSale = await this.fetchFreshFlashSaleWithRelations(Number(params.id))

    if (!flashSale)
      return response.status(404).send({ message: 'Flash Sale not found', serve: null })
    return response.status(200).send({ message: 'Success', serve: flashSale })
  }

  public async create({ request, response, auth }: HttpContext) {
    const payload: any = await request.validateUsing(createFlashSaleValidator)
    const trx = await db.transaction()

    try {
      const promoStart = DateTime.fromJSDate(payload.start_datetime).setZone('Asia/Jakarta')
      const promoEnd = DateTime.fromJSDate(payload.end_datetime).setZone('Asia/Jakarta')
      const willBePublished = payload.is_publish ?? false

      const variantsProvided = Array.isArray(payload.variants) && payload.variants.length > 0
      const productsProvided = Array.isArray(payload.products) && payload.products.length > 0

      if (!variantsProvided && !productsProvided) {
        await trx.rollback()
        return response
          .status(422)
          .send({ message: 'variants or products is required', serve: null })
      }

      // Conflict guard butuh productIds
      let requestedProductIds: number[] = []
      if (variantsProvided) {
        const requestedVariantIds = uniqPositiveInts(
          (payload.variants || []).map((v: any) => v.variant_id)
        )
        requestedProductIds = await this.productIdsFromVariantIds(trx, requestedVariantIds)
      } else {
        requestedProductIds = uniqPositiveInts(
          (payload.products || []).map((p: any) => p.product_id)
        )
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

      const flashSale = await FlashSale.create(
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

      let affectedProductIds: number[] = []

      if (variantsProvided) {
        const rows = (payload.variants || []).map((v: any) => ({
          flash_sale_id: flashSale.id,
          product_variant_id: v.variant_id,
          flash_price: v.flash_price,
          stock: v.stock,
        }))

        const variantIds = await this.replaceFlashsaleVariants(trx, flashSale.id, rows)
        affectedProductIds = await this.productIdsFromVariantIds(trx, variantIds)

        // bersihin legacy pivot biar gak dobel sumber data
        await trx.from('flashsale_products').where('flash_sale_id', flashSale.id).delete()
      } else {
        const rows = (payload.products || []).map((p: any) => ({
          flash_sale_id: flashSale.id,
          product_id: p.product_id,
          flash_price: p.flash_price,
          stock: p.stock,
        }))

        const productIds = await this.pivot.replacePromoProducts(
          trx,
          'flashsale_products',
          'flash_sale_id',
          flashSale.id,
          rows
        )
        affectedProductIds = productIds

        // bersihin variant pivot kalau ada (harusnya kosong, tapi aman)
        await trx.from('flashsale_variants').where('flash_sale_id', flashSale.id).delete()
      }

      // sync flag is_flash_sale
      if (affectedProductIds.length) {
        await this.promoFlag.syncFlashSaleFlags(affectedProductIds, trx)
      }

      await trx.commit()

      const freshFlashSale = await this.fetchFreshFlashSaleWithRelations(flashSale.id)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Flash Sale ${flashSale.title}`,
        menu: 'Flash Sale',
        data: freshFlashSale ?? flashSale.toJSON(),
      })

      return response
        .status(201)
        .send({ message: 'Flash Sale created successfully', serve: freshFlashSale ?? flashSale })
    } catch (error: any) {
      await trx.rollback()
      return response
        .status(500)
        .send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async update({ params, request, response, auth }: HttpContext) {
    const payload: any = await request.validateUsing(updateFlashSaleValidator)

    const flashSale = await FlashSale.find(params.id)
    if (!flashSale)
      return response.status(404).send({ message: 'Flash Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = flashSale.toJSON()

      // old pivot state (product-level + variant-level)
      const oldProductIdsFromProducts = await this.pivot.getPromoProductIds(
        trx,
        'flashsale_products',
        'flash_sale_id',
        flashSale.id
      )
      const oldVariantIds = await this.getFlashsaleVariantIds(trx, flashSale.id)
      const oldProductIdsFromVariants = await this.productIdsFromVariantIds(trx, oldVariantIds)

      const newStart = payload.start_datetime
        ? DateTime.fromJSDate(payload.start_datetime)
        : flashSale.startDatetime
      const newEnd = payload.end_datetime
        ? DateTime.fromJSDate(payload.end_datetime)
        : flashSale.endDatetime
      const willBePublished = payload.is_publish ?? flashSale.isPublish

      const variantsProvided = payload.variants !== undefined
      const productsProvided = payload.products !== undefined

      // Tentukan ids untuk conflict guard (kalau tidak update items, pakai union existing)
      let guardProductIds: number[] = []
      if (variantsProvided) {
        const newVariantIds = uniqPositiveInts(
          (payload.variants || []).map((v: any) => v.variant_id)
        )
        guardProductIds = await this.productIdsFromVariantIds(trx, newVariantIds)
      } else if (productsProvided) {
        guardProductIds = uniqPositiveInts((payload.products || []).map((p: any) => p.product_id))
      } else {
        guardProductIds = this.uniq([...oldProductIdsFromProducts, ...oldProductIdsFromVariants])
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

      flashSale.merge({
        title: payload.title ?? flashSale.title,
        description: payload.description ?? flashSale.description,
        hasButton: payload.has_button ?? flashSale.hasButton,
        buttonText: payload.button_text ?? flashSale.buttonText,
        buttonUrl: payload.button_url ?? flashSale.buttonUrl,
        startDatetime: payload.start_datetime
          ? DateTime.fromJSDate(payload.start_datetime)
          : flashSale.startDatetime,
        endDatetime: payload.end_datetime
          ? DateTime.fromJSDate(payload.end_datetime)
          : flashSale.endDatetime,
        isPublish: willBePublished,
        updatedBy: auth.user?.id,
      })

      await flashSale.useTransaction(trx).save()

      // final affected ids (buat sync flag)
      let finalProductIdsFromProducts = oldProductIdsFromProducts
      let finalProductIdsFromVariants = oldProductIdsFromVariants

      if (variantsProvided) {
        const rows = (payload.variants || []).map((v: any) => ({
          flash_sale_id: flashSale.id,
          product_variant_id: v.variant_id,
          flash_price: v.flash_price,
          stock: v.stock,
        }))

        const newVariantIds = await this.replaceFlashsaleVariants(trx, flashSale.id, rows)
        finalProductIdsFromVariants = await this.productIdsFromVariantIds(trx, newVariantIds)

        // kalau update via variants, bersihin legacy products pivot biar gak dobel
        await trx.from('flashsale_products').where('flash_sale_id', flashSale.id).delete()
        finalProductIdsFromProducts = []
      } else if (productsProvided) {
        const rows = (payload.products || []).map((p: any) => ({
          flash_sale_id: flashSale.id,
          product_id: p.product_id,
          flash_price: p.flash_price,
          stock: p.stock,
        }))

        finalProductIdsFromProducts = await this.pivot.replacePromoProducts(
          trx,
          'flashsale_products',
          'flash_sale_id',
          flashSale.id,
          rows
        )

        // kalau update via products, bersihin variant pivot biar gak dobel
        await trx.from('flashsale_variants').where('flash_sale_id', flashSale.id).delete()
        finalProductIdsFromVariants = []
      }

      const affectedIds = this.uniq([
        ...(oldProductIdsFromProducts || []),
        ...(oldProductIdsFromVariants || []),
        ...(finalProductIdsFromProducts || []),
        ...(finalProductIdsFromVariants || []),
      ])

      if (affectedIds.length) {
        await this.promoFlag.syncFlashSaleFlags(affectedIds, trx)
      }

      await trx.commit()

      const freshFlashSale = await this.fetchFreshFlashSaleWithRelations(flashSale.id)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Flash Sale ${oldData.title}`,
        menu: 'Flash Sale',
        data: { old: oldData, new: freshFlashSale ?? flashSale.toJSON() },
      })

      return response
        .status(200)
        .send({ message: 'Flash Sale updated successfully', serve: freshFlashSale ?? flashSale })
    } catch (error: any) {
      await trx.rollback()
      return response
        .status(500)
        .send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async delete({ params, response, auth }: HttpContext) {
    const flashSale = await FlashSale.find(params.id)
    if (!flashSale)
      return response.status(404).send({ message: 'Flash Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = flashSale.toJSON()

      // collect affected productIds from both pivots
      const prodIds = await this.pivot.getPromoProductIds(
        trx,
        'flashsale_products',
        'flash_sale_id',
        flashSale.id
      )
      const variantIds = await this.getFlashsaleVariantIds(trx, flashSale.id)
      const prodIdsFromVariants = await this.productIdsFromVariantIds(trx, variantIds)

      const affectedIds = this.uniq([...(prodIds || []), ...(prodIdsFromVariants || [])])

      await trx.from('flashsale_products').where('flash_sale_id', flashSale.id).delete()
      await trx.from('flashsale_variants').where('flash_sale_id', flashSale.id).delete()
      await flashSale.useTransaction(trx).delete()

      if (affectedIds.length) {
        await this.promoFlag.syncFlashSaleFlags(affectedIds, trx)
      }

      await trx.commit()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Delete Flash Sale ${oldData.title}`,
        menu: 'Flash Sale',
        data: oldData,
      })

      return response.status(200).send({ message: 'Flash Sale deleted successfully', serve: true })
    } catch (error: any) {
      await trx.rollback()
      return response
        .status(500)
        .send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }
}