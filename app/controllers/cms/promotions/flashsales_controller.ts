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
        message: 'Produk sedang ikut Discount (auto) pada periode tersebut. Tidak bisa dimasukkan ke Flash Sale.',
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
    await trx.table('flashsale_variants').multiInsert(rows)
    return uniqPositiveInts(rows.map((r: any) => r.product_variant_id))
  }

  public async get({ response }: HttpContext) {
    const flashSales = await FlashSale.query()
      .preload('products', (q) => q.pivotColumns(['flash_price', 'stock']))
      .preload('variants', (q) => q.pivotColumns(['flash_price', 'stock']))
      .orderBy('start_datetime', 'desc')

    return response.status(200).send({ message: 'Success', serve: flashSales })
  }

  public async show({ params, response }: HttpContext) {
    const flashSale = await FlashSale.query()
      .where('id', params.id)
      .preload('products', (q) => q.pivotColumns(['flash_price', 'stock']))
      .preload('variants', (q) => q.pivotColumns(['flash_price', 'stock']))
      .first()

    if (!flashSale) return response.status(404).send({ message: 'Flash Sale not found', serve: null })
    return response.status(200).send({ message: 'Success', serve: flashSale })
  }

  public async create({ request, response, auth }: HttpContext) {
    const payload: any = await request.validateUsing(createFlashSaleValidator)
    const trx = await db.transaction()

    try {
      const promoStart = DateTime.fromJSDate(payload.start_datetime).setZone('Asia/Jakarta')
      const promoEnd = DateTime.fromJSDate(payload.end_datetime).setZone('Asia/Jakarta')
      const willBePublished = payload.is_publish ?? true

      const variantsProvided = Array.isArray(payload.variants) && payload.variants.length > 0
      const productsProvided = Array.isArray(payload.products) && payload.products.length > 0

      if (!variantsProvided && !productsProvided) {
        await trx.rollback()
        return response.status(422).send({ message: 'variants or products is required', serve: null })
      }

      // Conflict guard butuh productIds
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

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Flash Sale ${flashSale.title}`,
        menu: 'Flash Sale',
        data: flashSale.toJSON(),
      })

      return response.status(201).send({ message: 'Flash Sale created successfully', serve: flashSale })
    } catch (error: any) {
      await trx.rollback()
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async update({ params, request, response, auth }: HttpContext) {
    const payload: any = await request.validateUsing(updateFlashSaleValidator)

    const flashSale = await FlashSale.find(params.id)
    if (!flashSale) return response.status(404).send({ message: 'Flash Sale not found', serve: null })

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

      const newStart = payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : flashSale.startDatetime
      const newEnd = payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : flashSale.endDatetime
      const willBePublished = payload.is_publish ?? flashSale.isPublish

      const variantsProvided = payload.variants !== undefined
      const productsProvided = payload.products !== undefined

      // Tentukan ids untuk conflict guard (kalau tidak update items, pakai union existing)
      let guardProductIds: number[] = []
      if (variantsProvided) {
        const newVariantIds = uniqPositiveInts((payload.variants || []).map((v: any) => v.variant_id))
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
        startDatetime: payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : flashSale.startDatetime,
        endDatetime: payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : flashSale.endDatetime,
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

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Flash Sale ${oldData.title}`,
        menu: 'Flash Sale',
        data: { old: oldData, new: flashSale.toJSON() },
      })

      return response.status(200).send({ message: 'Flash Sale updated successfully', serve: flashSale })
    } catch (error: any) {
      await trx.rollback()
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async delete({ params, response, auth }: HttpContext) {
    const flashSale = await FlashSale.find(params.id)
    if (!flashSale) return response.status(404).send({ message: 'Flash Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = flashSale.toJSON()

      // collect affected productIds from both pivots
      const prodIds = await this.pivot.getPromoProductIds(trx, 'flashsale_products', 'flash_sale_id', flashSale.id)
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
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }
}
