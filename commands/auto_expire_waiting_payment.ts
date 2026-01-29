import env from '#start/env'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'

import Transaction from '#models/transaction'
import TransactionEcommerce from '#models/transaction_ecommerce'
import VoucherClaim, { VoucherClaimStatus } from '#models/voucher_claim'
import ReferralRedemption, { ReferralRedemptionStatus } from '#models/referral_redemption'

import { TransactionStatus } from '../app/enums/transaction_status.js'
import NumberUtils from '../app/utils/number.js'
import { TimezoneUtils } from '../app/utils/timezone.js'

import { StockService } from '../app/services/ecommerce/stock_service.js'
import { VoucherCalculator } from '../app/services/ecommerce/voucher_calculator.js'
import { DiscountEngineService } from '../app/services/discount/discount_engine_service.js'

export default class AutoExpireWaitingPayment extends BaseCommand {
  static commandName = 'auto:expire-waiting-payment'
  static description =
    'Auto-expire transaksi ecommerce WAITING_PAYMENT yang sudah lewat N menit: set FAILED + restore stock/voucher/discount + cancel referral redemption.'

  static options: CommandOptions = {
    startApp: true,
  }

  private stock = new StockService()
  private voucher = new VoucherCalculator()
  private discountEngine = new DiscountEngineService()

  private toInt(v: any, fallback: number) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  async run() {
    // Default aman: 24 jam (1440 menit). Kamu bisa turunin kalau mau.
    const AFTER_MINUTES = this.toInt(env.get('AUTO_EXPIRE_WAITING_PAYMENT_AFTER_MINUTES'), 1440)
    const LIMIT = this.toInt(env.get('AUTO_EXPIRE_WAITING_PAYMENT_LIMIT'), 200)

    const cutoff = TimezoneUtils.createCutoff({ minutes: AFTER_MINUTES })

    this.logger.info(`Auto expire job start`)
    this.logger.info(`AFTER_MINUTES=${AFTER_MINUTES}, LIMIT=${LIMIT}, cutoff<=${cutoff.toISOString()}`)

    const candidates = await Transaction.query()
      .where('transactionStatus', String(TransactionStatus.WAITING_PAYMENT))
      .where('channel', 'ecommerce')
      .where('created_at', '<=', cutoff)
      .limit(LIMIT)

    if (!candidates.length) {
      this.logger.info('No transactions to expire.')
      return
    }

    let expired = 0
    let skipped = 0
    let failed = 0

    for (const row of candidates as any[]) {
      try {
        const didExpire = await this.expireOne(row.id)
        if (didExpire) expired++
        else skipped++
      } catch (e: any) {
        failed++
        this.logger.error(`Expire failed for txId=${row.id}: ${e?.message || e}`)
      }
    }

    this.logger.info(
      `Auto expire done: candidates=${candidates.length}, expired=${expired}, skipped=${skipped}, failed=${failed}`
    )
  }

  private async expireOne(transactionId: number): Promise<boolean> {
    return db.transaction(async (trx) => {
      const t = await Transaction.query({ client: trx }).where('id', transactionId).forUpdate().first()
      if (!t) return false

      // idempotent guard
      if (String(t.transactionStatus) !== String(TransactionStatus.WAITING_PAYMENT)) return false
      if (String(t.channel) !== 'ecommerce') return false

      const ecommerce = await TransactionEcommerce.query({ client: trx })
        .where('transaction_id', t.id)
        .first()

      // set FAILED
      t.transactionStatus = String(TransactionStatus.FAILED) as any
      await t.useTransaction(trx).save()

      const nowJkt = TimezoneUtils.now()

      // restore stock + popularity
      await this.stock.restoreFromTransaction(trx, t.id)

      // cancel auto discount reserve (idempotent)
      await this.discountEngine.cancelReserve(t.id, trx as any)

      // cancel referral redemption pending (idempotent)
      await ReferralRedemption.query({ client: trx })
        .where('transaction_id', t.id)
        .where('status', ReferralRedemptionStatus.PENDING)
        .update({
          status: ReferralRedemptionStatus.CANCELED,
          processedAt: nowJkt,
        })

      // restore voucher claim (kalau ada)
      const voucherId = ecommerce?.voucherId ?? null
      if (voucherId) {
        const claim = await VoucherClaim.query({ client: trx })
          .where('transaction_id', t.id)
          .where('voucher_id', voucherId)
          .forUpdate()
          .first()

        const claimStatus = NumberUtils.toNumber((claim as any)?.status, -1)

        if (claim && claimStatus === VoucherClaimStatus.RESERVED) {
          claim.status = VoucherClaimStatus.CLAIMED
          claim.transactionId = null
          claim.reservedAt = null
          claim.usedAt = null
          await claim.useTransaction(trx).save()
        } else {
          // fallback safety (kalau ada case lain)
          await this.voucher.restoreVoucher(trx, voucherId)
        }
      }

      return true
    })
  }
}
