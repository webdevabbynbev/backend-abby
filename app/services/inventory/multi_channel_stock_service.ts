import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import ProductVariant from '#models/product_variant'
import ProductVariantStock, { StockChannel } from '#models/product_variant_stock'
import StockTransfer, { StockTransferStatus } from '#models/stock_transfer'
import StockMovement from '#models/stock_movement'

export class MultiChannelStockService {
  /**
   * Get stock for specific variant and channel
   */
  async getChannelStock(variantId: number, channel: string): Promise<ProductVariantStock | null> {
    return await ProductVariantStock.query()
      .where('product_variant_id', variantId)
      .where('channel', channel)
      .first()
  }

  /**
   * Get all channel stocks for a variant
   */
  async getAllChannelStocks(variantId: number): Promise<ProductVariantStock[]> {
    return await ProductVariantStock.query()
      .where('product_variant_id', variantId)
      .orderBy('channel', 'asc')
  }

  /**
   * Initialize stock for all channels (if not exists)
   */
  async initializeChannelStocks(variantId: number, initialStock: number = 0): Promise<void> {
    const channels = Object.values(StockChannel)
    
    for (const channel of channels) {
      const existing = await this.getChannelStock(variantId, channel)
      if (!existing) {
        await ProductVariantStock.create({
          productVariantId: variantId,
          channel,
          stock: initialStock,
          reservedStock: 0
        })
      }
    }
  }

  /**
   * Update stock for specific channel
   */
  async updateChannelStock(
    variantId: number, 
    channel: string, 
    newStock: number, 
    note?: string
  ): Promise<ProductVariantStock> {
    const channelStock = await ProductVariantStock.query()
      .where('product_variant_id', variantId)
      .where('channel', channel)
      .first()

    if (!channelStock) {
      throw new Error(`Channel stock not found for variant ${variantId} and channel ${channel}`)
    }

    const oldStock = channelStock.stock
    const change = newStock - oldStock

    return await db.transaction(async (trx) => {
      // Update channel stock
      channelStock.useTransaction(trx)
      channelStock.stock = newStock
      await channelStock.save()

      // Also update main variant stock (sum of all channels)
      const variant = await ProductVariant.query({ client: trx }).where('id', variantId).first()
      if (variant) {
        const allChannelStocks = await ProductVariantStock.query({ client: trx })
          .where('product_variant_id', variantId)
        
        const totalStock = allChannelStocks.reduce((sum, cs) => sum + (cs.stock || 0), 0)
        variant.stock = totalStock
        await variant.save()
      }

      // Log stock movement
      if (change !== 0) {
        await StockMovement.create({
          productVariantId: variantId,
          change,
          type: `channel_update_${channel}`,
          note: note || `Stock update for channel ${channel}`
        }, { client: trx })
      }

      return channelStock
    })
  }

  /**
   * Reserve stock for pending transaction
   */
  async reserveStock(variantId: number, channel: string, quantity: number): Promise<boolean> {
    const channelStock = await this.getChannelStock(variantId, channel)
    if (!channelStock || !channelStock.hasSufficientStock(quantity)) {
      return false
    }

    channelStock.reservedStock = (channelStock.reservedStock || 0) + quantity
    await channelStock.save()
    return true
  }

  /**
   * Release reserved stock (when transaction cancelled/failed)
   */
  async releaseReservedStock(variantId: number, channel: string, quantity: number): Promise<void> {
    const channelStock = await this.getChannelStock(variantId, channel)
    if (channelStock) {
      channelStock.reservedStock = Math.max(0, (channelStock.reservedStock || 0) - quantity)
      await channelStock.save()
    }
  }

  /**
   * Commit reserved stock (when transaction completed)
   */
  async commitReservedStock(variantId: number, channel: string, quantity: number): Promise<void> {
    return await db.transaction(async (trx) => {
      const channelStock = await ProductVariantStock.query({ client: trx })
        .where('product_variant_id', variantId)
        .where('channel', channel)
        .first()

      if (!channelStock) return

      // Reduce both stock and reserved stock
      channelStock.useTransaction(trx)
      channelStock.stock = Math.max(0, channelStock.stock - quantity)
      channelStock.reservedStock = Math.max(0, channelStock.reservedStock - quantity)
      await channelStock.save()

      // Update main variant stock
      const variant = await ProductVariant.query({ client: trx }).where('id', variantId).first()
      if (variant) {
        const allChannelStocks = await ProductVariantStock.query({ client: trx })
          .where('product_variant_id', variantId)
        
        const totalStock = allChannelStocks.reduce((sum, cs) => sum + (cs.stock || 0), 0)
        variant.stock = totalStock
        await variant.save()
      }

      // Log stock movement
      await StockMovement.create({
        productVariantId: variantId,
        change: -quantity,
        type: `sale_${channel}`,
        note: `Stock sold via ${channel}`
      }, { client: trx })
    })
  }

  /**
   * Request stock transfer between channels
   */
  async requestTransfer(
    variantId: number,
    fromChannel: string,
    toChannel: string,
    quantity: number,
    requestedBy: string,
    note?: string
  ): Promise<StockTransfer> {
    // Check if source channel has sufficient stock
    const sourceStock = await this.getChannelStock(variantId, fromChannel)
    if (!sourceStock || !sourceStock.hasSufficientStock(quantity)) {
      throw new Error(`Insufficient stock in ${fromChannel}. Available: ${sourceStock?.availableStock || 0}, Requested: ${quantity}`)
    }

    return await StockTransfer.create({
      productVariantId: variantId,
      fromChannel,
      toChannel,
      quantity,
      status: StockTransferStatus.PENDING,
      note,
      requestedBy,
      requestedAt: DateTime.now()
    } as any)
  }

  /**
   * Execute approved stock transfer
   */
  async executeTransfer(transferId: number, executedBy: string): Promise<void> {
    return await db.transaction(async (trx) => {
      const transfer = await StockTransfer.query({ client: trx })
        .where('id', transferId)
        .where('status', StockTransferStatus.APPROVED)
        .first()

      if (!transfer) {
        throw new Error('Transfer not found or not approved')
      }

      const sourceStock = await ProductVariantStock.query({ client: trx })
        .where('product_variant_id', transfer.productVariantId)
        .where('channel', transfer.fromChannel)
        .first()

      const targetStock = await ProductVariantStock.query({ client: trx })
        .where('product_variant_id', transfer.productVariantId)
        .where('channel', transfer.toChannel)
        .first()

      if (!sourceStock || !targetStock) {
        throw new Error('Channel stock records not found')
      }

      if (!sourceStock.hasSufficientStock(transfer.quantity)) {
        throw new Error('Insufficient stock for transfer')
      }

      // Move stock
      sourceStock.useTransaction(trx)
      sourceStock.stock -= transfer.quantity
      await sourceStock.save()

      targetStock.useTransaction(trx)
      targetStock.stock += transfer.quantity
      await targetStock.save()

      // Complete transfer
      transfer.useTransaction(trx)
      await transfer.complete()

      // Log stock movements
      await StockMovement.create({
        productVariantId: transfer.productVariantId,
        change: -transfer.quantity,
        type: `transfer_out_${transfer.fromChannel}`,
        relatedId: transfer.id,
        note: `Transfer to ${transfer.toChannel}: ${transfer.note || ''}`
      }, { client: trx })

      await StockMovement.create({
        productVariantId: transfer.productVariantId,
        change: transfer.quantity,
        type: `transfer_in_${transfer.toChannel}`,
        relatedId: transfer.id,
        note: `Transfer from ${transfer.fromChannel}: ${transfer.note || ''}`
      }, { client: trx })
    })
  }

  /**
   * Get stock transfer requests with filters
   */
  async getTransferRequests(filters: {
    status?: StockTransferStatus
    fromChannel?: string
    toChannel?: string
    variantId?: number
    page?: number
    perPage?: number
  } = {}) {
    const query = StockTransfer.query()
      .preload('variant', (q) => q.preload('product'))
      .orderBy('requested_at', 'desc')

    if (filters.status) query.where('status', filters.status)
    if (filters.fromChannel) query.where('from_channel', filters.fromChannel)
    if (filters.toChannel) query.where('to_channel', filters.toChannel)
    if (filters.variantId) query.where('product_variant_id', filters.variantId)

    if (filters.page && filters.perPage) {
      return await query.paginate(filters.page, filters.perPage)
    }

    return await query
  }
}