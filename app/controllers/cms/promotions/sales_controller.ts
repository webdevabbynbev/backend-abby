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

  public async get({ response }: HttpContext) {
    const sales = await Sale.query()
      .preload('products', (q) => q.pivotColumns(['sale_price', 'stock']))
      .orderBy('start_datetime', 'desc')

    return response.status(200).send({ message: 'Success', serve: sales })
  }

  public async show({ params, response }: HttpContext) {
    const sale = await Sale.query()
      .where('id', params.id)
      .preload('products', (q) => q.pivotColumns(['sale_price', 'stock']))
      .first()

    if (!sale) return response.status(404).send({ message: 'Sale not found', serve: null })
    return response.status(200).send({ message: 'Success', serve: sale })
  }

  public async create({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(createSaleValidator)
    const trx = await db.transaction()

    try {
      const promoStart = DateTime.fromJSDate(payload.start_datetime).setZone('Asia/Jakarta')
      const promoEnd = DateTime.fromJSDate(payload.end_datetime).setZone('Asia/Jakarta')
      const willBePublished = payload.is_publish ?? false

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

      const sale = await Sale.create(
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
        sale_id: sale.id,
        product_id: p.product_id,
        sale_price: p.sale_price,
        stock: p.stock,
      }))

      await this.pivot.replacePromoProducts(trx, 'sale_products', 'sale_id', sale.id, rows)

      await trx.commit()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Sale ${sale.title}`,
        menu: 'Sale',
        data: sale.toJSON(),
      })

      return response.status(201).send({ message: 'Sale created successfully', serve: sale })
    } catch (error: any) {
      await trx.rollback()
      return response.status(500).send({ message: error.message || 'Internal Server Error', serve: null })
    }
  }

  public async update({ params, request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(updateSaleValidator)

    const sale = await Sale.find(params.id)
    if (!sale) return response.status(404).send({ message: 'Sale not found', serve: null })

    const trx = await db.transaction()

    try {
      const oldData = sale.toJSON()

      const oldIds = await this.pivot.getPromoProductIds(trx, 'sale_products', 'sale_id', sale.id)

      const newStart = payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : sale.startDatetime
      const newEnd = payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : sale.endDatetime
      const willBePublished = payload.is_publish ?? sale.isPublish

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

      sale.merge({
        title: payload.title ?? sale.title,
        description: payload.description ?? sale.description,
        hasButton: payload.has_button ?? sale.hasButton,
        buttonText: payload.button_text ?? sale.buttonText,
        buttonUrl: payload.button_url ?? sale.buttonUrl,
        startDatetime: payload.start_datetime ? DateTime.fromJSDate(payload.start_datetime) : sale.startDatetime,
        endDatetime: payload.end_datetime ? DateTime.fromJSDate(payload.end_datetime) : sale.endDatetime,
        isPublish: payload.is_publish ?? sale.isPublish,
        updatedBy: auth.user?.id,
      })

      await sale.useTransaction(trx).save()

      if (productsProvided) {
        const rows = (payload.products || []).map((p) => ({
          sale_id: sale.id,
          product_id: p.product_id,
          sale_price: p.sale_price,
          stock: p.stock,
        }))

        await this.pivot.replacePromoProducts(trx, 'sale_products', 'sale_id', sale.id, rows)
      }

      await trx.commit()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Sale ${oldData.title}`,
        menu: 'Sale',
        data: { old: oldData, new: sale.toJSON() },
      })

      return response.status(200).send({ message: 'Sale updated successfully', serve: sale })
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
