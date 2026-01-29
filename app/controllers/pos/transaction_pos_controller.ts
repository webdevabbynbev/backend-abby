import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Transaction from '#models/transaction'
import TransactionDetail from '#models/transaction_detail'
import TransactionPos from '#models/transaction_pos'
import ProductVariant from '#models/product_variant'
import User from '#models/user'
import { cuid } from '@adonisjs/core/helpers'
import { SecurityUtils } from '#utils/security'

interface TransactionItem {
  barcode: string
  qty: number
  variant?: ProductVariant
  calculatedPrice?: number
  calculatedAmount?: number
}

export default class TransactionPosController {
  public async store({ request, response, auth }: HttpContext) {
    const trx = await db.transaction()
    
    try {
      // Validate basic input
      const { products, payment_method, received_amount } = request.only(['products', 'payment_method', 'received_amount'])

      // Validate products
      if (!Array.isArray(products) || products.length === 0) {
        await trx.rollback()
        return response.status(422).send({ message: 'Products array is required' })
      }
      
      if (products.length > 100) {
        await trx.rollback()
        return response.status(422).send({ message: 'Too many products in single transaction' })
      }

      // Validate cashier
      const cashier_id = auth.user!.id
      const cashier = await User.find(cashier_id)

      if (!cashier) {
        await trx.rollback()
        return response.status(404).send({ message: 'Cashier not found' })
      }

      // Secure role validation using SecurityUtils
      const cashierRole = SecurityUtils.safeNumber(cashier.role, -1)
      if (![6, 7].includes(cashierRole)) {
        await trx.rollback()
        return response.status(403).send({ message: 'Only cashier can create POS transaction' })
      }

      // Prepare transaction items with race condition protection
      const transactionItems: TransactionItem[] = []
      let subTotal = 0

      // Step 1: Lock all variants to prevent race condition
      const barcodes = products.map(item => item.barcode)
      const variants = await ProductVariant.query({ client: trx })
        .whereIn('barcode', barcodes)
        .forUpdate() // Critical: Lock rows to prevent race condition
        .preload('product')

      // Step 2: Validate all items first (fail fast)
      for (const item of products) {
        const variant = variants.find(v => v.barcode === item.barcode)
        
        if (!variant) {
          await trx.rollback()
          return response.status(404).send({
            message: `Product with barcode ${item.barcode} not found`,
          })
        }

        if (!variant.product || !variant.productId) {
          await trx.rollback()
          return response.status(400).send({
            message: `Product missing for variant ${variant.id}`,
          })
        }

        // Secure numeric conversion
        const price = SecurityUtils.safePrice(variant.price, 0)
        const qty = SecurityUtils.safeQuantity(item.qty, 0)
        
        if (price <= 0) {
          await trx.rollback()
          return response.status(400).send({
            message: `Invalid price for product ${variant.product.name}`,
          })
        }
        
        if (qty <= 0) {
          await trx.rollback()
          return response.status(400).send({
            message: `Invalid quantity for product ${variant.product.name}`,
          })
        }

        // Stock validation
        const currentStock = SecurityUtils.safeNumber(variant.stock, 0)
        if (currentStock < qty) {
          await trx.rollback()
          return response.status(400).send({
            message: `Insufficient stock for product ${variant.product.name}. Available: ${currentStock}, Requested: ${qty}`,
          })
        }

        const amount = price * qty
        subTotal += amount

        transactionItems.push({
          barcode: item.barcode,
          qty,
          variant,
          calculatedPrice: price,
          calculatedAmount: amount,
        })
      }

      // Step 3: Validate payment
      const receivedAmountNum = SecurityUtils.safePrice(received_amount, 0)
      if (receivedAmountNum < subTotal) {
        await trx.rollback()
        return response.status(400).send({
          message: 'Received amount is less than total price',
        })
      }

      // Step 4: Create transaction and adjust stock atomically
      const transaction = new Transaction()
      transaction.transactionNumber = `STOREAB-${cuid()}`
      transaction.amount = subTotal
      transaction.discount = 0
      transaction.discountType = 0
      transaction.subTotal = subTotal
      transaction.grandTotal = subTotal
      transaction.channel = 'pos'
      transaction.userId = cashier_id
      await transaction.useTransaction(trx).save()

      // Step 5: Create transaction details and adjust stock
      const transactionDetails: TransactionDetail[] = []
      
      for (const item of transactionItems) {
        const { variant, qty, calculatedPrice, calculatedAmount } = item
        
        // Adjust stock with proper transaction context
        await variant!.adjustStock(-qty, 'sale', transaction.id, 'POS sale', trx)

        const detail = new TransactionDetail()
        detail.transactionId = transaction.id
        detail.productId = variant!.productId!
        detail.productVariantId = variant!.id
        detail.qty = qty
        detail.price = calculatedPrice!
        detail.amount = calculatedAmount!.toString()
        await detail.useTransaction(trx).save()
        
        transactionDetails.push(detail)
      }

      // Step 6: Create POS-specific transaction record
      const safeReceivedAmount = SecurityUtils.safePrice(received_amount, 0)
      const changeAmount = safeReceivedAmount - subTotal

      const transactionPos = new TransactionPos()
      transactionPos.transactionId = transaction.id
      transactionPos.cashierId = cashier_id
      transactionPos.paymentMethod = payment_method
      transactionPos.receivedAmount = safeReceivedAmount
      transactionPos.changeAmount = changeAmount
      await transactionPos.useTransaction(trx).save()

      // Commit transaction
      await trx.commit()
      
      // Log successful transaction for audit
      try {
        console.log(`POS Transaction created: ${transaction.transactionNumber} by cashier ${cashier_id}`)
      } catch (logError) {
        // Don't fail transaction if logging fails
        console.error('Audit logging failed:', logError)
      }

      return response.status(201).send({
        message: 'POS Transaction created successfully',
        data: {
          transaction: {
            id: transaction.id,
            number: transaction.transactionNumber,
            subtotal: transaction.subTotal,
            grandTotal: transaction.grandTotal,
            paymentMethod: transactionPos.paymentMethod,
            receivedAmount: transactionPos.receivedAmount,
            changeAmount: transactionPos.changeAmount,
          },
          cashier: { 
            id: cashier.id, 
            name: `${cashier.firstName || ''} ${cashier.lastName || ''}`.trim() || 'Cashier'
          },
          items: transactionDetails.map((d) => ({
            productId: d.productId,
            productVariantId: d.productVariantId,
            qty: d.qty,
            price: d.price,
            amount: d.amount,
          })),
        },
      })
    } catch (error: any) {
      await trx.rollback()
      
      // Log error for debugging (without exposing to client)
      console.error('POS Transaction error:', error)
      
      // Check if it's a validation error
      if (error?.status === 422 || error?.code === 'E_VALIDATION_ERROR') {
        return response.status(422).send({
          message: 'Transaction validation failed',
          serve: error.messages || [],
        })
      }
      
      // Generic error response
      return response.status(500).send({ 
        message: 'Transaction failed. Please try again.',
        serve: [] 
      })
    }
  }
}
