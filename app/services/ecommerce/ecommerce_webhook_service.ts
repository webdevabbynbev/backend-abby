import db from '@adonisjs/lucid/services/db'
import Transaction from '#models/transaction'
import TransactionEcommerce from '#models/transaction_ecommerce'
import { TransactionStatus } from '../../enums/transaction_status.js'

import { MidtransService } from './midtrans_service.js'
import { StockService } from './stock_service.js'
import { VoucherCalculator } from './voucher_calculator.js'

import NumberUtils from '../../utils/number.js'
import { DateTime } from 'luxon'
import VoucherClaim, { VoucherClaimStatus } from '#models/voucher_claim'
import { DiscountEngineService } from '#services/discount/discount_engine_service'

import ReferralRedemption, { ReferralRedemptionStatus } from '#models/referral_redemption'

export class EcommerceWebhookService {
  private midtrans = new MidtransService()
  private stock = new StockService()
  private voucher = new VoucherCalculator()

  // ✅ discount auto reserve/usage
  private discountEngine = new DiscountEngineService()

  async handleMidtransWebhook(payload: any) {
    return db.transaction(async (trx) => {
      if (!this.midtrans.verifySignature(payload)) {
        const err: any = new Error('Invalid signature')
        err.httpStatus = 401
        throw err
      }

      const orderId = String(payload.order_id || '')
      const transaction = await Transaction.query({ client: trx })
        .where('transaction_number', orderId)
        .first()

      if (!transaction) return { ok: true }

      const transactionEcommerce = await TransactionEcommerce.query({ client: trx })
        .where('transaction_id', transaction.id)
        .first()

      const transactionStatus = this.midtrans.normalizeStatus(payload.transaction_status)
      const fraudStatus = this.midtrans.normalizeStatus(payload.fraud_status)

      if (transactionEcommerce) {
        transactionEcommerce.paymentMethod = payload.payment_type || null
        transactionEcommerce.receipt = this.midtrans.pickReceipt(payload) || null
        await transactionEcommerce.useTransaction(trx).save()
      }

      const nowJkt = DateTime.now().setZone('Asia/Jakarta')

      const current = String(transaction.transactionStatus || '')

      // ✅ kalau sudah FAILED, jangan do restore stock lagi.
      // tapi tetap pastiin referral redemption gak nyangkut PENDING.
      if (current === TransactionStatus.FAILED.toString()) {
        await ReferralRedemption.query({ client: trx })
          .where('transaction_id', transaction.id)
          .where('status', ReferralRedemptionStatus.PENDING)
          .update({
            status: ReferralRedemptionStatus.CANCELED,
            processedAt: nowJkt,
          })
        return { ok: true }
      }

      const isFinal =
        current === TransactionStatus.ON_PROCESS.toString() ||
        current === TransactionStatus.ON_DELIVERY.toString() ||
        current === TransactionStatus.COMPLETED.toString()

      let nextStatus: string | null = null
      if (transactionStatus === 'capture' && fraudStatus === 'accept') {
        nextStatus = TransactionStatus.PAID_WAITING_ADMIN.toString()
      } else if (transactionStatus === 'settlement') {
        nextStatus = TransactionStatus.PAID_WAITING_ADMIN.toString()
      } else if (transactionStatus === 'pending') {
        nextStatus = TransactionStatus.WAITING_PAYMENT.toString()
      } else if (['deny', 'cancel', 'expire', 'failure'].includes(transactionStatus)) {
        nextStatus = TransactionStatus.FAILED.toString()
      }

      const isDowngrade =
        current === TransactionStatus.PAID_WAITING_ADMIN.toString() &&
        nextStatus === TransactionStatus.WAITING_PAYMENT.toString()

      const prevStatus = current
      let changed = false

      if (nextStatus && !isFinal && !isDowngrade && prevStatus !== nextStatus) {
        transaction.transactionStatus = nextStatus
        await transaction.useTransaction(trx).save()
        changed = true
      }

      // =====================================
      // ✅ FAILED: restore stock + restore voucher + cancel discount reserve + cancel referral redemption
      // (hanya saat transisi status jadi FAILED)
      // =====================================
      if (
        changed &&
        nextStatus === TransactionStatus.FAILED.toString() &&
        prevStatus !== TransactionStatus.FAILED.toString()
      ) {
        const voucherId = transactionEcommerce?.voucherId ?? null

        await this.stock.restoreFromTransaction(trx, transaction.id)

        // cancel auto discount reserve
        await this.discountEngine.cancelReserve(transaction.id)

        // cancel referral redemption (kalau ada)
        await ReferralRedemption.query({ client: trx })
          .where('transaction_id', transaction.id)
          .where('status', ReferralRedemptionStatus.PENDING)
          .update({
            status: ReferralRedemptionStatus.CANCELED,
            processedAt: nowJkt,
          })

        if (voucherId) {
          const claim = await VoucherClaim.query({ client: trx })
            .where('transaction_id', transaction.id)
            .where('voucher_id', voucherId)
            .forUpdate()
            .first()

          if (claim && NumberUtils.toNumber(claim.status) === VoucherClaimStatus.RESERVED) {
            claim.status = VoucherClaimStatus.CLAIMED
            claim.transactionId = null
            claim.reservedAt = null
            await claim.useTransaction(trx).save()
          } else {
            await this.voucher.restoreVoucher(trx, voucherId)
          }
        }
      }

      // =====================================
      // ✅ PAID_WAITING_ADMIN: idempotent finalize voucher + mark discount used + success referral redemption
      // (jalan kalau status sudah paid juga, bukan cuma changed)
      // =====================================
      const alreadyPaid = current === TransactionStatus.PAID_WAITING_ADMIN.toString()
      const willBePaid = nextStatus === TransactionStatus.PAID_WAITING_ADMIN.toString()

      if ((changed && willBePaid) || (!changed && alreadyPaid) || (!changed && willBePaid)) {
        const voucherId = transactionEcommerce?.voucherId ?? null

        if (voucherId) {
          const claim = await VoucherClaim.query({ client: trx })
            .where('transaction_id', transaction.id)
            .where('voucher_id', voucherId)
            .forUpdate()
            .first()

          if (claim && NumberUtils.toNumber(claim.status) === VoucherClaimStatus.RESERVED) {
            claim.status = VoucherClaimStatus.USED
            claim.usedAt = nowJkt
            await claim.useTransaction(trx).save()
          }
        }

        // mark auto discount used (idempotent)
        await this.discountEngine.markUsed(transaction.id)

        // mark referral redemption SUCCESS (idempotent)
        await ReferralRedemption.query({ client: trx })
          .where('transaction_id', transaction.id)
          .where('status', ReferralRedemptionStatus.PENDING)
          .update({
            status: ReferralRedemptionStatus.SUCCESS,
            processedAt: nowJkt,
          })
      }

      return { ok: true }
    })
  }
}
