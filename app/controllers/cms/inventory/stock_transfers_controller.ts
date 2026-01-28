import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import { MultiChannelStockService } from '#services/inventory/multi_channel_stock_service'
import ProductVariant from '#models/product_variant'
import { StockChannel } from '#models/product_variant_stock'
import { StockTransferStatus } from '#models/stock_transfer'

export default class StockTransfersController {
  private stockService = new MultiChannelStockService()

  /**
   * Get all channel stocks for a variant
   */
  public async getChannelStocks({ params, response }: HttpContext) {
    try {
      const { variantId } = params
      
      const variant = await ProductVariant.find(variantId)
      if (!variant) {
        return response.status(404).send({
          message: 'Variant not found',
          serve: null
        })
      }

      const channelStocks = await this.stockService.getAllChannelStocks(variantId)
      
      return response.ok({
        message: 'Success',
        serve: {
          variant,
          channelStocks,
          availableChannels: Object.values(StockChannel)
        }
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Update stock for specific channel
   */
  public async updateChannelStock({ params, request, response, auth }: HttpContext) {
    try {
      const { variantId, channel } = params
      const { stock, note } = request.all()

      await this.stockService.updateChannelStock(variantId, channel, stock, note)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Stock Channel ${channel}`,
        menu: 'Stock Management',
        data: { variantId, channel, stock, note }
      })

      return response.ok({
        message: 'Stock updated successfully',
        serve: null
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Initialize channel stocks for a variant
   */
  public async initializeChannelStocks({ params, request, response, auth }: HttpContext) {
    try {
      const { variantId } = params
      const { initialStock } = request.all()

      await this.stockService.initializeChannelStocks(variantId, initialStock || 0)

      // @ts-ignore  
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Initialize Channel Stocks`,
        menu: 'Stock Management',
        data: { variantId, initialStock }
      })

      return response.ok({
        message: 'Channel stocks initialized successfully',
        serve: null
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Request stock transfer
   */
  public async requestTransfer({ request, response, auth }: HttpContext) {
    try {
      const { variantId, fromChannel, toChannel, quantity, note } = request.all()

      const transfer = await this.stockService.requestTransfer(
        variantId,
        fromChannel,
        toChannel,
        quantity,
        auth.user?.name || 'Unknown',
        note
      )

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Request Stock Transfer`,
        menu: 'Stock Transfer',
        data: { variantId, fromChannel, toChannel, quantity, note }
      })

      return response.ok({
        message: 'Transfer request created successfully',
        serve: transfer
      })
    } catch (error) {
      return response.status(400).send({
        message: error.message || 'Failed to create transfer request',
        serve: null
      })
    }
  }

  /**
   * Get transfer requests
   */
  public async getTransferRequests({ request, response }: HttpContext) {
    try {
      const filters = {
        status: request.input('status'),
        fromChannel: request.input('from_channel'),
        toChannel: request.input('to_channel'),
        variantId: request.input('variant_id'),
        page: Number(request.input('page', 1)),
        perPage: Number(request.input('per_page', 20))
      }

      const transfers = await this.stockService.getTransferRequests(filters)

      return response.ok({
        message: 'Success',
        serve: transfers
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Approve transfer request
   */
  public async approveTransfer({ params, response, auth }: HttpContext) {
    try {
      const { transferId } = params

      const transfer = await this.stockService.getTransferRequests({ 
        variantId: undefined 
      }).then(transfers => transfers.find((t: any) => t.id == transferId))

      if (!transfer) {
        return response.status(404).send({
          message: 'Transfer request not found',
          serve: null
        })
      }

      await transfer.approve(auth.user?.name || 'Unknown')

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Approve Stock Transfer`,
        menu: 'Stock Transfer',
        data: { transferId, fromChannel: transfer.fromChannel, toChannel: transfer.toChannel }
      })

      return response.ok({
        message: 'Transfer request approved',
        serve: transfer
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Execute approved transfer
   */
  public async executeTransfer({ params, response, auth }: HttpContext) {
    try {
      const { transferId } = params

      await this.stockService.executeTransfer(transferId, auth.user?.name || 'Unknown')

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Execute Stock Transfer`,
        menu: 'Stock Transfer',
        data: { transferId }
      })

      return response.ok({
        message: 'Transfer executed successfully',
        serve: null
      })
    } catch (error) {
      return response.status(400).send({
        message: error.message || 'Failed to execute transfer',
        serve: null
      })
    }
  }

  /**
   * Reject transfer request
   */
  public async rejectTransfer({ params, request, response, auth }: HttpContext) {
    try {
      const { transferId } = params
      const { reason } = request.all()

      const transfer = await this.stockService.getTransferRequests({
        variantId: undefined
      }).then(transfers => transfers.find((t: any) => t.id == transferId))

      if (!transfer) {
        return response.status(404).send({
          message: 'Transfer request not found',
          serve: null
        })
      }

      await transfer.reject(auth.user?.name || 'Unknown', reason)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Reject Stock Transfer`,
        menu: 'Stock Transfer',
        data: { transferId, reason }
      })

      return response.ok({
        message: 'Transfer request rejected',
        serve: transfer
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }
}