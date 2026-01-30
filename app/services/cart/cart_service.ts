import db from '@adonisjs/lucid/services/db'
import ProductVariant from '#models/product_variant'
import ProductOnline from '#models/product_online'
import TransactionCart from '#models/transaction_cart'

import { CartRepository } from './cart_repository.js'
import { CartPricingService } from './cart_pricing_service.js'
import { CartPresenter } from './cart_presenter.js'
import { parseCartListParams } from './cart_params.js'
import { PrecisionMath } from '#utils/precision_math'
import { SecurityUtils } from '#utils/security'
import { BundleCompositionService } from '../bundle/bundle_composition_service.js'

type BundleStockMode = 'KIT' | 'VIRTUAL'

export class CartService {
  private repo = new CartRepository()
  private pricing = new CartPricingService()
  private presenter = new CartPresenter()
  private bundle = new BundleCompositionService()

  // Cart limits
  private readonly MAX_QUANTITY_PER_ITEM = 999
  private readonly MAX_ITEMS_PER_USER = 100
  private readonly MAX_TOTAL_QUANTITY = 9999

  /**
   * Validate cart constraints
   */
  private async validateCartLimits(
    trx: any,
    userId: number,
    excludeCartId?: number
  ): Promise<{ valid: boolean; error?: string }> {
    const query = TransactionCart.query({ client: trx }).where('user_id', userId)

    if (excludeCartId) {
      query.whereNot('id', excludeCartId)
    }

    const userCarts = await query

    // Check total items
    if (userCarts.length >= this.MAX_ITEMS_PER_USER) {
      return {
        valid: false,
        error: `Maximum ${this.MAX_ITEMS_PER_USER} different items in cart`,
      }
    }

    // Check total quantity
    const totalQty = userCarts.reduce((sum, cart) => sum + Number(cart.qty || 0), 0)
    if (totalQty >= this.MAX_TOTAL_QUANTITY) {
      return {
        valid: false,
        error: `Maximum total quantity ${this.MAX_TOTAL_QUANTITY} exceeded`,
      }
    }

    return { valid: true }
  }

  /**
   * KIT-aware stock check:
   * - non-bundle: use variant.stock
   * - bundle KIT: use bundleVariant.stock (independent stock)
   * - bundle VIRTUAL: compute from components (real-time)
   */
  private async getAvailableStockForVariant(trx: any, variant: ProductVariant): Promise<number> {
    const isBundle = Boolean((variant as any).isBundle)
    if (!isBundle) {
      return SecurityUtils.safeNumber((variant as any).stock, 0)
    }

    const modeRaw = String(((variant as any).bundleStockMode ?? 'KIT') as BundleStockMode).toUpperCase()
    const mode: BundleStockMode = modeRaw === 'VIRTUAL' ? 'VIRTUAL' : 'KIT'

    // KIT: stok bundle berdiri sendiri
    if (mode === 'KIT') {
      return SecurityUtils.safeNumber((variant as any).stock, 0)
    }

    // VIRTUAL: stok dihitung dari komponen
    return await this.bundle.computeAvailable(trx, variant.id)
  }

  async getTotal(userId: number) {
    return this.repo.getTotalRaw(userId)
  }

  async getList(userId: number, qs: any, request: any) {
    const { sortBy, sortType, isCheckout, page, perPage, includeVariantAttributes } =
      parseCartListParams(qs)

    const paginator = await this.repo.paginateForUser(userId, {
      sortBy,
      sortType,
      isCheckout,
      page,
      perPage,
      includeVariantAttributes,
    })

    const json = paginator.toJSON() as any
    return this.presenter.presentPaginated({ meta: json.meta, data: json.data }, request)
  }

  async addToCart(userId: number, payload: any) {
    return db.transaction(async (trx) => {
      const productId = SecurityUtils.safeNumber(payload.product_id, 0)
      let variantId = SecurityUtils.safeNumber(payload.variant_id, 0)
      const qty = SecurityUtils.safeQuantity(payload.qty, 0)
      const isBuyNow = !!payload.is_buy_now
      const attributes = payload.attributes || []

      // Validate quantity
      if (!productId || qty <= 0 || qty > this.MAX_QUANTITY_PER_ITEM) {
        const err: any = new Error(
          `Invalid quantity. Must be between 1 and ${this.MAX_QUANTITY_PER_ITEM}`
        )
        err.httpStatus = 400
        throw err
      }

      const productOnline = await ProductOnline.query({ client: trx })
        .where('product_id', productId)
        .where('is_active', true)
        .preload('product')
        .first()

      if (!productOnline || !productOnline.product) {
        const err: any = new Error('Product not available online')
        err.httpStatus = 400
        throw err
      }

      if (!variantId) {
        const fallbackVariant = await ProductVariant.query({ client: trx })
          .where('product_id', productId)
          .whereNull('deleted_at')
          .orderBy('id', 'asc')
          .first()
        variantId = Number(fallbackVariant?.id ?? 0)
      }

      // Lock variant to check stock
      const variant = await ProductVariant.query({ client: trx })
        .where('id', variantId)
        .forUpdate()
        .first()

      if (!variant) {
        const err: any = new Error('Product variant not found')
        err.httpStatus = 400
        throw err
      }

      const pricePerUnit = SecurityUtils.safePrice((variant as any).price, 0)
      const discountPerUnit = await this.pricing.getDiscountPerUnit(trx, productId, pricePerUnit)
      const finalPerUnit = PrecisionMath.subtract(pricePerUnit, discountPerUnit)

      const existing = await this.repo.findExisting(trx, userId, productId, variantId)

      // Check cart limits (bedakan kasus existing vs baru)
      const cartValidation = await this.validateCartLimits(
        trx,
        userId,
        existing ? (existing as any).id : undefined
      )
      if (!cartValidation.valid) {
        const err: any = new Error(cartValidation.error)
        err.httpStatus = 400
        throw err
      }

      // keep behavior: selalu set is_checkout = 1
      const checkoutFlag = 1

      if (existing) {
        const newQty = SecurityUtils.safeQuantity((existing as any).qty, 0) + qty

        // Validate new quantity
        if (newQty > this.MAX_QUANTITY_PER_ITEM) {
          const err: any = new Error(`Maximum ${this.MAX_QUANTITY_PER_ITEM} items per product`)
          err.httpStatus = 400
          throw err
        }

        const availableStock = await this.getAvailableStockForVariant(trx, variant)
        if (availableStock < newQty) {
          const err: any = new Error(`Stock not enough. Available: ${availableStock}`)
          err.httpStatus = 400
          throw err
        }

        ;(existing as any).qty = newQty
        ;(existing as any).qtyCheckout = newQty
        ;(existing as any).isCheckout = checkoutFlag
        ;(existing as any).price = pricePerUnit
        ;(existing as any).discount = discountPerUnit
        ;(existing as any).amount = PrecisionMath.calculateAmount(finalPerUnit, newQty, 0)
        ;(existing as any).attributes = JSON.stringify(attributes)

        await (existing as any).save()

        return { message: 'Produk berhasil ditambahkan', serve: existing, httpStatus: 200 }
      }

      // Check stock for new cart item
      const availableStock2 = await this.getAvailableStockForVariant(trx, variant)
      if (availableStock2 < qty) {
        const err: any = new Error(`Stock not enough. Available: ${availableStock2}`)
        err.httpStatus = 400
        throw err
      }

      const cart = new TransactionCart()
      cart.useTransaction(trx)

      cart.userId = userId
      cart.productId = productId
      cart.productVariantId = variantId
      cart.qty = qty
      cart.qtyCheckout = qty
      cart.isCheckout = checkoutFlag
      cart.price = pricePerUnit
      cart.discount = discountPerUnit
      cart.amount = PrecisionMath.calculateAmount(finalPerUnit, qty, 0)
      cart.attributes = JSON.stringify(attributes)

      await cart.save()

      return { message: 'Produk dimasukan ke keranjang belanja.', serve: cart, httpStatus: 200 }
    })
  }

  async updateQty(userId: number, cartId: number, qty: number) {
    return db.transaction(async (trx) => {
      const safeQty = SecurityUtils.safeQuantity(qty, -1)

      if (!cartId) {
        const err: any = new Error('Invalid cart ID')
        err.httpStatus = 400
        throw err
      }

      if (safeQty > this.MAX_QUANTITY_PER_ITEM) {
        const err: any = new Error(`Maximum ${this.MAX_QUANTITY_PER_ITEM} items per product`)
        err.httpStatus = 400
        throw err
      }

      const cart = await this.repo.findByIdForUser(trx, userId, cartId)
      if (!cart) {
        const err: any = new Error('Cart item not found')
        err.httpStatus = 404
        throw err
      }

      // Delete if qty is 0 or negative
      if (safeQty <= 0) {
        await (cart as any).delete()
        return { message: 'Deleted successfully', serve: [], httpStatus: 200 }
      }

      // lock variant langsung dari DB biar stock check nggak stale
      const lockedVariant = await ProductVariant.query({ client: trx })
        .where('id', (cart as any).productVariantId)
        .forUpdate()
        .first()

      if (!lockedVariant) {
        const err: any = new Error('Product variant not found')
        err.httpStatus = 400
        throw err
      }

      const availableStock = await this.getAvailableStockForVariant(trx, lockedVariant)
      if (availableStock < safeQty) {
        const err: any = new Error(`Stock not enough. Available: ${availableStock}`)
        err.httpStatus = 400
        throw err
      }

      ;(cart as any).qty = safeQty
      ;(cart as any).qtyCheckout = safeQty

      const pricePerUnit = SecurityUtils.safePrice((cart as any).price, 0)
      const discPerUnit = SecurityUtils.safePrice((cart as any).discount, 0)

      ;(cart as any).amount = PrecisionMath.calculateAmount(pricePerUnit, safeQty, discPerUnit)
      await (cart as any).save()

      return { message: 'Cart updated', serve: cart, httpStatus: 200 }
    })
  }

  async updateSelection(userId: number, cartIds: any[], isCheckout: any) {
    const ids = Array.isArray(cartIds) ? cartIds.map((x) => Number(x)).filter((x) => x > 0) : []
    const next = Number(isCheckout)

    if (!userId) {
      const err: any = new Error('Unauthenticated')
      err.httpStatus = 401
      throw err
    }

    if (!ids.length) {
      return { message: 'Cart selection updated', serve: { affected: 0 } }
    }

    if (!Number.isFinite(next)) {
      const err: any = new Error('is_checkout invalid')
      err.httpStatus = 400
      throw err
    }

    const affected = await TransactionCart.query()
      .whereIn('id', ids)
      .where('user_id', userId)
      .update({ is_checkout: next })

    return { message: 'Cart selection updated', serve: { affected } }
  }

  async miniCart(userId: number, request: any) {
    const carts = await this.repo.miniForUser(userId, 10)
    const { items, subtotal } = this.presenter.presentMini(carts.map((c) => c.toJSON()), request)
    return { message: 'success', serve: { data: items, subtotal } }
  }

  async deleteItem(userId: number, cartId: number) {
    return db.transaction(async (trx) => {
      if (!cartId) {
        const err: any = new Error('Invalid id')
        err.httpStatus = 400
        throw err
      }

      const cart = await this.repo.findByIdOnly(trx, userId, cartId)
      if (!cart) {
        const err: any = new Error('Cart item not found')
        err.httpStatus = 404
        throw err
      }

      await (cart as any).delete()
      return { message: 'Deleted successfully', serve: [], httpStatus: 200 }
    })
  }
}
