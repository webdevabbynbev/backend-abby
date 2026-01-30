import TransactionDetail from '#models/transaction_detail'
import ProductVariant from '#models/product_variant'
import Product from '#models/product'
import TransactionCart from '#models/transaction_cart'
import NumberUtils from '../../utils/number.js'
import { BundleCompositionService } from '../bundle/bundle_composition_service.js'

type PromoMeta = {
  kind: 'flash' | 'sale'
  promo_id: number
  variant_id: number
  price?: number
  stock_decremented?: boolean
}

type BundleStockMode = 'KIT' | 'VIRTUAL'

function safeParseJson(input: any): any | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null
  if (!(s.startsWith('{') || s.startsWith('['))) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function normalizePromoMeta(promo: any, variantId: number, stockDecremented: boolean): PromoMeta | null {
  if (!promo) return null

  const rawKind = String(promo.kind ?? promo.type ?? promo.promo_type ?? '').toLowerCase().trim()
  const promoId = NumberUtils.toNumber(promo.promoId ?? promo.promo_id ?? promo.id, 0)

  const kind =
    rawKind.includes('flash') ? 'flash'
    : rawKind.includes('sale') ? 'sale'
    : null

  if (!kind || promoId <= 0 || variantId <= 0) return null

  const price = NumberUtils.toNumber(promo.price ?? promo.promo_price ?? promo.flash_price ?? promo.sale_price, 0)

  return {
    kind,
    promo_id: promoId,
    variant_id: variantId,
    price: price > 0 ? price : undefined,
    stock_decremented: !!stockDecremented,
  }
}

function mergeAttributes(cartAttributes: any, promoMeta: PromoMeta | null, bundleItems?: any[] | null) {
  const parsed = safeParseJson(cartAttributes)

  let base: any
  if (parsed && typeof parsed === 'object') {
    base = parsed
  } else if (cartAttributes) {
    base = { raw_attributes: cartAttributes }
  } else {
    base = {}
  }

  if (promoMeta) {
    base.promo = promoMeta
  }

  // Snapshot bundle (untuk restore VIRTUAL)
  if (Array.isArray(bundleItems) && bundleItems.length) {
    base.bundle = { items: bundleItems }
  }

  return JSON.stringify(base)
}

function normalizeBundleStockMode(input: any): BundleStockMode {
  const raw = String(input ?? '').toUpperCase().trim()
  return raw === 'VIRTUAL' ? 'VIRTUAL' : 'KIT'
}

export class StockService {
  private bundle = new BundleCompositionService()

  private async lockAndConsumePromoStock(trx: any, cart: any, qty: number) {
    const variantId = NumberUtils.toNumber(cart.productVariantId ?? cart.variantId ?? cart?.variant?.id, 0)
    if (!variantId) return { used: false, stockDecremented: false }

    const promo = (cart as any).promo
    if (!promo) return { used: false, stockDecremented: false }

    const rawKind = String(promo.kind ?? promo.type ?? promo.promo_type ?? '').toLowerCase().trim()
    const promoId = NumberUtils.toNumber(promo.promoId ?? promo.promo_id ?? promo.id, 0)

    const isFlash = rawKind.includes('flash')
    const isSale = rawKind.includes('sale')

    if (!promoId || (!isFlash && !isSale)) {
      const err: any = new Error('Promo invalid.')
      err.httpStatus = 500
      throw err
    }

    if (isFlash) {
      const row = await trx
        .from('flashsale_variants')
        .where('flash_sale_id', promoId)
        .where('product_variant_id', variantId)
        .forUpdate()
        .first()

      if (!row) {
        const err: any = new Error('Promo Flash Sale sudah tidak tersedia.')
        err.httpStatus = 400
        throw err
      }

      const promoStock = NumberUtils.toNumber(row.stock, 0)
      if (promoStock > 0 && promoStock < qty) {
        const err: any = new Error('Stok promo tidak cukup.')
        err.httpStatus = 400
        throw err
      }

      if (promoStock > 0) {
        await trx
          .from('flashsale_variants')
          .where('flash_sale_id', promoId)
          .where('product_variant_id', variantId)
          .update({ stock: promoStock - qty })

        return { used: true, stockDecremented: true }
      }

      return { used: true, stockDecremented: false }
    }

    const row = await trx
      .from('sale_variants')
      .where('sale_id', promoId)
      .where('product_variant_id', variantId)
      .forUpdate()
      .first()

    if (!row) {
      const err: any = new Error('Promo Sale sudah tidak tersedia.')
      err.httpStatus = 400
      throw err
    }

    const promoStock = NumberUtils.toNumber(row.stock, 0)
    if (promoStock > 0 && promoStock < qty) {
      const err: any = new Error('Stok promo tidak cukup.')
      err.httpStatus = 400
      throw err
    }

    if (promoStock > 0) {
      await trx
        .from('sale_variants')
        .where('sale_id', promoId)
        .where('product_variant_id', variantId)
        .update({ stock: promoStock - qty })

      return { used: true, stockDecremented: true }
    }

    return { used: true, stockDecremented: false }
  }

  async reduceFromCarts(trx: any, carts: any[], transactionId: number) {
    for (const cart of carts as any[]) {
      const qty = cart.qtyCheckout > 0 ? cart.qtyCheckout : cart.qty
      if (!cart.productVariantId) continue
      if (qty <= 0) continue

      const promoResult = await this.lockAndConsumePromoStock(trx, cart, qty)

      const productVariant = await ProductVariant.query({ client: trx })
        .preload('product')
        .where('id', cart.productVariantId)
        .forUpdate()
        .first()

      if (!productVariant) {
        const err: any = new Error('Variant not found')
        err.httpStatus = 400
        throw err
      }

      const isBundle = Boolean((productVariant as any).isBundle)
      const bundleMode: BundleStockMode = normalizeBundleStockMode((productVariant as any).bundleStockMode)

      let bundleSnapshot: any[] | null = null

      if (isBundle && bundleMode === 'VIRTUAL') {
        // VIRTUAL: potong stok komponen
        bundleSnapshot = await this.bundle.consume(trx, productVariant.id, qty)

        // sync pv.stock sebagai "computed stock" untuk listing (optional)
        const availableAfter = await this.bundle.computeAvailable(trx, productVariant.id)
        ;(productVariant as any).stock = availableAfter
        await productVariant.useTransaction(trx).save()
      } else {
        // NON-BUNDLE atau BUNDLE KIT: potong stok variant itu sendiri
        const stockNow = NumberUtils.toNumber((productVariant as any).stock, 0)
        if (stockNow < qty) {
          const err: any = new Error(`Stock not enough for ${productVariant.product?.name || 'product'}`)
          err.httpStatus = 400
          throw err
        }

        ;(productVariant as any).stock = stockNow - qty
        await productVariant.useTransaction(trx).save()
      }

      const variantId = NumberUtils.toNumber(cart.productVariantId, 0)
      const promoMeta = normalizePromoMeta((cart as any).promo, variantId, promoResult.stockDecremented)

      const transactionDetail = new TransactionDetail()
      transactionDetail.qty = qty
      transactionDetail.price = NumberUtils.toNumber(cart.price)
      transactionDetail.amount = (
        (NumberUtils.toNumber(cart.price) - NumberUtils.toNumber(cart.discount)) * qty
      ).toString()
      transactionDetail.discount = NumberUtils.toNumber(cart.discount)

      // attributes merge promo + bundle snapshot (snapshot hanya ada utk VIRTUAL)
      transactionDetail.attributes = mergeAttributes(cart.attributes ?? '', promoMeta, bundleSnapshot)

      transactionDetail.transactionId = transactionId
      transactionDetail.productId = cart.productId ?? 0
      transactionDetail.productVariantId = cart.productVariantId
      await transactionDetail.useTransaction(trx).save()

      if (cart.productId) {
        const product = await Product.query({ client: trx }).where('id', cart.productId).first()
        if (product) {
          product.popularity = NumberUtils.toNumber(product.popularity) + 1
          await product.useTransaction(trx).save()
        }
      }

      await TransactionCart.query({ client: trx }).where('id', cart.id).delete()
    }
  }

  private async restorePromoFromDetail(trx: any, detail: any) {
    const parsed = safeParseJson(detail.attributes)
    if (!parsed || typeof parsed !== 'object') return

    const promo: PromoMeta | undefined = (parsed as any).promo
    if (!promo) return

    const kind = String((promo as any).kind || '').toLowerCase().trim()
    const promoId = NumberUtils.toNumber((promo as any).promo_id, 0)
    const variantId = NumberUtils.toNumber((promo as any).variant_id, 0)
    const stockDecremented = !!(promo as any).stock_decremented

    if (!stockDecremented) return
    if (!promoId || !variantId) return

    const qty = NumberUtils.toNumber(detail.qty, 0)
    if (qty <= 0) return

    if (kind === 'flash') {
      const row = await trx
        .from('flashsale_variants')
        .where('flash_sale_id', promoId)
        .where('product_variant_id', variantId)
        .forUpdate()
        .first()

      if (!row) return
      const stockNow = NumberUtils.toNumber(row.stock, 0)
      await trx
        .from('flashsale_variants')
        .where('flash_sale_id', promoId)
        .where('product_variant_id', variantId)
        .update({ stock: stockNow + qty })

      return
    }

    if (kind === 'sale') {
      const row = await trx
        .from('sale_variants')
        .where('sale_id', promoId)
        .where('product_variant_id', variantId)
        .forUpdate()
        .first()

      if (!row) return
      const stockNow = NumberUtils.toNumber(row.stock, 0)
      await trx
        .from('sale_variants')
        .where('sale_id', promoId)
        .where('product_variant_id', variantId)
        .update({ stock: stockNow + qty })

      return
    }
  }

  async restoreFromTransaction(trx: any, transactionId: number) {
    const details = await TransactionDetail.query({ client: trx }).where('transaction_id', transactionId)

    for (const d of details as any[]) {
      await this.restorePromoFromDetail(trx, d)

      const parsed = safeParseJson(d.attributes)
      const bundleItems = parsed?.bundle?.items

      // VIRTUAL restore: restore komponen dari snapshot
      if (Array.isArray(bundleItems) && bundleItems.length) {
        await this.bundle.restore(trx, bundleItems)

        // optional: sync stock bundle computed
        if (d.productVariantId) {
          const pv = await ProductVariant.query({ client: trx }).where('id', d.productVariantId).forUpdate().first()
          if (pv) {
            ;(pv as any).stock = await this.bundle.computeAvailable(trx, pv.id)
            await pv.useTransaction(trx).save()
          }
        }
      } else {
        // KIT (atau non-bundle) restore: balikin stock variant itu sendiri
        if (d.productVariantId) {
          const pv = await ProductVariant.query({ client: trx }).where('id', d.productVariantId).forUpdate().first()
          if (pv) {
            ;(pv as any).stock = NumberUtils.toNumber((pv as any).stock) + NumberUtils.toNumber(d.qty)
            await pv.useTransaction(trx).save()
          }
        }
      }

      if (d.productId) {
        const p = await Product.query({ client: trx }).where('id', d.productId).forUpdate().first()
        if (p) {
          p.popularity = Math.max(0, NumberUtils.toNumber(p.popularity) - 1)
          await p.useTransaction(trx).save()
        }
      }
    }
  }
}
