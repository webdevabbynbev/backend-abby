import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import { MultiChannelStockService } from '#services/inventory/multi_channel_stock_service'
import ProductVariant from '#models/product_variant'
import Product from '#models/product'
import Brand from '#models/brand'
import ProductVariantStock from '#models/product_variant_stock'
import db from '@adonisjs/lucid/services/db'

export default class BulkStockTransfersController {
  private stockService = new MultiChannelStockService()

  /**
   * Get products/variants for bulk transfer selection
   */
  public async getTransferableItems({ request, response }: HttpContext) {
    try {
      const page = Number(request.input('page', 1))
      const perPage = Number(request.input('per_page', 20))
      
      // Filters
      const keyword = request.input('keyword')  // product name
      const brandId = request.input('brand_id')
      const categoryId = request.input('category_id')
      const fromChannel = request.input('from_channel')
      const minStock = Number(request.input('min_stock', 0))

      const query = ProductVariant.query()
        .join('products', 'products.id', 'product_variants.product_id')
        .leftJoin('product_variant_stocks', 'product_variant_stocks.product_variant_id', '=', 'product_variants.id')
        .select([
          'product_variants.*',
          'products.name as product_name',
          'products.brand_id',
          'products.category_type_id',
          'product_variant_stocks.stock as channel_stock',
          'product_variant_stocks.reserved_stock as channel_reserved_stock'
        ])
        .preload('product', (q) => {
          q.preload('brand')
          q.preload('categoryType')
        })
        .whereNull('products.deleted_at')
        .whereNull('product_variants.deleted_at')

      if (keyword) {
        query.where((subQ) => {
          subQ.whereILike('products.name', `%${keyword}%`)
            .orWhere('product_variants.sku', 'like', `%${keyword}%`)
            .orWhere('product_variants.barcode', 'like', `%${keyword}%`)
        })
      }

      if (brandId) query.where('products.brand_id', brandId)
      if (categoryId) query.where('products.category_type_id', categoryId)
      if (fromChannel) query.where('product_variant_stocks.channel', fromChannel)
      
      if (fromChannel && minStock > 0) {
        query.having('channel_stock', '>=', minStock)
      }

      const result = await query.paginate(page, perPage)

      // Get channel stocks for each variant
      const variants = result.all()
      const variantIds = variants.map(v => v.id)
      
      const channelStocks = await ProductVariantStock.query()
        .whereIn('product_variant_id', variantIds)
        .orderBy('channel', 'asc')

      // Group by variant
      const stocksByVariant = channelStocks.reduce((acc, stock) => {
        if (!acc[stock.productVariantId]) acc[stock.productVariantId] = []
        acc[stock.productVariantId].push(stock)
        return acc
      }, {} as Record<number, ProductVariantStock[]>)

      // Attach stocks to variants
      const enrichedVariants = variants.map(variant => ({
        ...variant.toJSON(),
        channelStocks: stocksByVariant[variant.id] || []
      }))

      return response.ok({
        message: 'Success',
        serve: {
          data: enrichedVariants,
          ...result.toJSON().meta
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
   * Get brands for filter dropdown
   */
  public async getBrands({ response }: HttpContext) {
    try {
      const brands = await Brand.query()
        .whereNull('deleted_at')
        .orderBy('name', 'asc')
        .select(['id', 'name', 'slug'])

      return response.ok({
        message: 'Success',
        serve: brands
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Bulk request stock transfer for multiple variants
   */
  public async bulkRequestTransfer({ request, response, auth }: HttpContext) {
    try {
      const {
        fromChannel,
        toChannel,
        note,
        items // [{ variantId: 123, quantity: 10 }, { variantId: 124, quantity: 5 }]
      } = request.all()

      if (!Array.isArray(items) || items.length === 0) {
        return response.status(400).send({
          message: 'Items array is required and must not be empty',
          serve: null
        })
      }

      const transfers = []
      const errors = []

      for (const item of items) {
        try {
          const transfer = await this.stockService.requestTransfer(
            item.variantId,
            fromChannel,
            toChannel,
            item.quantity,
            auth.user?.name || 'Unknown',
            note
          )
          transfers.push(transfer)
        } catch (error) {
          errors.push({
            variantId: item.variantId,
            error: error.message
          })
        }
      }

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Bulk Request Stock Transfer`,
        menu: 'Stock Transfer',
        data: {
          fromChannel,
          toChannel,
          itemsCount: items.length,
          successCount: transfers.length,
          errorCount: errors.length
        }
      })

      return response.ok({
        message: `Bulk transfer requested. ${transfers.length} successful, ${errors.length} failed.`,
        serve: {
          successful: transfers,
          errors: errors
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
   * Bulk transfer by product (all variants of selected products)
   */
  public async bulkTransferByProduct({ request, response, auth }: HttpContext) {
    try {
      const {
        productIds, // [123, 124, 125]
        fromChannel,
        toChannel,
        note
      } = request.all()

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return response.status(400).send({
          message: 'Product IDs array is required',
          serve: null
        })
      }

      // Get all variants for selected products that have stock in fromChannel
      const variants = await ProductVariant.query()
        .whereIn('product_id', productIds)
        .whereNull('deleted_at')
        .whereHas('product', (q) => q.whereNull('deleted_at'))

      const transfers = []
      const errors = []

      for (const variant of variants) {
        try {
          // Check if variant has stock in fromChannel
          const channelStock = await this.stockService.getChannelStock(variant.id, fromChannel)
          if (channelStock && channelStock.availableStock > 0) {
            const transfer = await this.stockService.requestTransfer(
              variant.id,
              fromChannel,
              toChannel,
              channelStock.availableStock, // Transfer all available stock
              auth.user?.name || 'Unknown',
              note
            )
            transfers.push(transfer)
          }
        } catch (error) {
          errors.push({
            variantId: variant.id,
            variantSku: variant.sku,
            error: error.message
          })
        }
      }

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Bulk Transfer By Product`,
        menu: 'Stock Transfer',
        data: {
          productIds,
          fromChannel,
          toChannel,
          successCount: transfers.length,
          errorCount: errors.length
        }
      })

      return response.ok({
        message: `Bulk transfer by product completed. ${transfers.length} transfers requested.`,
        serve: {
          successful: transfers,
          errors: errors
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
   * Bulk transfer by brand (all products of selected brands)
   */
  public async bulkTransferByBrand({ request, response, auth }: HttpContext) {
    try {
      const {
        brandIds, // [10, 11, 12]
        fromChannel,
        toChannel,
        note,
        minStock = 1 // Only transfer variants with at least this much stock
      } = request.all()

      if (!Array.isArray(brandIds) || brandIds.length === 0) {
        return response.status(400).send({
          message: 'Brand IDs array is required',
          serve: null
        })
      }

      // Get all variants for products of selected brands
      const variants = await ProductVariant.query()
        .whereHas('product', (q) => {
          q.whereIn('brand_id', brandIds)
          q.whereNull('deleted_at')
        })
        .whereNull('deleted_at')

      const transfers = []
      const errors = []

      for (const variant of variants) {
        try {
          const channelStock = await this.stockService.getChannelStock(variant.id, fromChannel)
          if (channelStock && channelStock.availableStock >= minStock) {
            const transfer = await this.stockService.requestTransfer(
              variant.id,
              fromChannel,
              toChannel,
              channelStock.availableStock,
              auth.user?.name || 'Unknown',
              note
            )
            transfers.push(transfer)
          }
        } catch (error) {
          errors.push({
            variantId: variant.id,
            variantSku: variant.sku,
            error: error.message
          })
        }
      }

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Bulk Transfer By Brand`,
        menu: 'Stock Transfer',
        data: {
          brandIds,
          fromChannel,
          toChannel,
          minStock,
          successCount: transfers.length,
          errorCount: errors.length
        }
      })

      return response.ok({
        message: `Bulk transfer by brand completed. ${transfers.length} transfers requested.`,
        serve: {
          successful: transfers,
          errors: errors
        }
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null
      })
    }
  }
}