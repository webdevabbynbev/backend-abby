import env from '#start/env'
import Transaction from '#models/transaction'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { TransactionStatus } from '../app/enums/transaction_status.js'
import { SyncShipmentTrackingUseCase } from '../app/services/shipping/use_cases/sync_shipment_tracking_use_case.js'
import { TimezoneUtils } from '../app/utils/timezone.js'

export default class AutoCompleteTransaction extends BaseCommand {
  static commandName = 'auto:complete-transaction'
  static description =
    'Sync Biteship tracking (shipping started + delivered) and auto-complete transactions after N days delivered.'

  static options: CommandOptions = {
    startApp: true,
  }

  private toInt(v: any, fallback: number) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  async run() {
    const AFTER_DAYS = this.toInt(env.get('AUTO_COMPLETE_AFTER_DAYS'), 3)
    const SYNC_LIMIT = this.toInt(env.get('AUTO_COMPLETE_SYNC_LIMIT'), 50)
    const COMPLETE_LIMIT = this.toInt(env.get('AUTO_COMPLETE_LIMIT'), 200)

    this.logger.info(`Auto complete job start`)
    this.logger.info(`AFTER_DAYS=${AFTER_DAYS}, SYNC_LIMIT=${SYNC_LIMIT}, COMPLETE_LIMIT=${COMPLETE_LIMIT}`)

    const syncTracking = new SyncShipmentTrackingUseCase()

    const candidates = await Transaction.query()
      .whereIn('transactionStatus', [String(TransactionStatus.ON_PROCESS), String(TransactionStatus.ON_DELIVERY)])
      .whereHas('shipments', (q) => q.whereNotNull('resi_number'))
      .preload('shipments')
      .limit(SYNC_LIMIT)

    let synced = 0

    for (const t of candidates as any[]) {
      const sh = t.shipments?.[0]
      if (!sh?.resiNumber) continue

      const courierCode = String(sh.service || '').toLowerCase().trim()
      if (!courierCode) continue

      if (String(sh.status || '') === 'Delivered') continue

      await syncTracking.execute({ transaction: t, shipment: sh, silent: true })
      synced++
    }

    this.logger.info(`Tracking sync done: candidates=${candidates.length}, synced=${synced}`)

    const cutoff = TimezoneUtils.createCutoff({ days: AFTER_DAYS })

    const toComplete = await Transaction.query()
      .where('transactionStatus', String(TransactionStatus.ON_DELIVERY))
      .whereHas('shipments', (q) => {
        q.where('status', 'Delivered').where('updated_at', '<=', cutoff)
      })
      .limit(COMPLETE_LIMIT)

    if (!toComplete.length) {
      this.logger.info('No transactions to complete.')
      return
    }

    const ids = toComplete.map((x: any) => x.id)

    const updated = await Transaction.query()
      .whereIn('id', ids)
      .update({ transactionStatus: String(TransactionStatus.COMPLETED) })

    this.logger.info(`Auto complete done: ${updated} transactions completed.`)
  }
}
