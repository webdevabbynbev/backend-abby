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

  public async get({ response }: HttpContext) {
    const flashSales = await FlashSale.query()
      .preload('products', (q) => q.pivotColumns(['flash_price', 'stock']))
      .orderBy('start_datetime', 'desc')

    return response.status(200).send({ message: 'Success', serve: flashSales })
  }

  public async show({ params, response }: HttpContext) {
    const flashSale = await FlashSale.query()
      .where('id', params.id)
      .preload('products', (q) => q.pivotColumns(['flash_price', 'stock']))
      .first()

    if (!flashSale) return response.status(404).send({ message: 'Flash Sale not found', serve: null })
    return response.status(200).send({ message: 'Success', serve: flashSale })
  }

  public async create({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(createFlashSaleValidator)
    const trx = await db.transaction()

    try {
      const promoStart = DateTime.fromJSDate(payload.start_datetime).setZone('Asia/Jakarta')
      const promoEnd = DateTime.fromJSDate(payload.end_datetime).setZone('Asia/Jakarta')
      const willBePublished = payload.is_publish ?? true

      const requestedProductIds = uniqPositiveInts((payload.products || []).map((p) => p.product_id))

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
          isPublish: payload.is_publish,
          createdBy: auth.user?.id,
          updatedBy: auth.user?.id,
        },
        { client: trx }
      )

      const rows = (payload.products || []).map((p) => ({
        flash_sale_id: flashSale.id,
        product_id: p.product_id,
        flash_price: p.flash_price,
        stock: p.stock,
      }))

      // ✅ replace pivot in one shot + return productIds
      const productIds = await this.pivot.replacePromoProducts(
        trx,
        'flashsale_products',
        'flash_sale_id',
        flashSale.id,
        rows
      )

      // ✅ sync flag is_flash_sale
      if (productIds.length) {
        await this.promoFlag.syncFlashSaleFlags(productIds, trx)
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
    const payload = await request.validateUsing(updateFlashSaleValidator)

    const flashSale = await FlashSale.find(params.id)
    if (!flashSale) return response.status(404).send({ message: 'Flash Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = flashSale.toJSON()

      const oldIds = await this.pivot.getPromoProductIds(trx, 'flashsale_products', 'flash_sale_id', flashSale.id)

      const newStart = payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : flashSale.startDatetime
      const newEnd = payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : flashSale.endDatetime
      const willBePublished = payload.is_publish ?? flashSale.isPublish

      const productsProvided = payload.products !== undefined
      const newIds = productsProvided
        ? uniqPositiveInts((payload.products || []).map((p) => p.product_id))
        : oldIds

      const guard = await this.assertNoAutoDiscountConflict(
        trx,
        willBePublished,
        newIds,
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
        isPublish: payload.is_publish ?? flashSale.isPublish,
        updatedBy: auth.user?.id,
      })

      await flashSale.useTransaction(trx).save()

      let finalIds: number[] = oldIds

      if (productsProvided) {
        const rows = (payload.products || []).map((p) => ({
          flash_sale_id: flashSale.id,
          product_id: p.product_id,
          flash_price: p.flash_price,
          stock: p.stock,
        }))

        finalIds = await this.pivot.replacePromoProducts(
          trx,
          'flashsale_products',
          'flash_sale_id',
          flashSale.id,
          rows
        )
      }

      // union old + final buat reset flag yg dilepas
      const affectedIds = Array.from(new Set([...(oldIds || []), ...(finalIds || [])])).filter(Boolean)
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

      const ids = await this.pivot.getPromoProductIds(trx, 'flashsale_products', 'flash_sale_id', flashSale.id)

      await trx.from('flashsale_products').where('flash_sale_id', flashSale.id).delete()
      await flashSale.useTransaction(trx).delete()

      if (ids.length) {
        await this.promoFlag.syncFlashSaleFlags(ids, trx)
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
