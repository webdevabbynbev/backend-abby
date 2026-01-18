import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { BiteshipTrackingService } from '#services/shipping/biteship_tracking_service'

type SyncArgs = {
  transaction: any
  shipment?: any | null
  trx?: TransactionClientContract
  silent?: boolean
}

export class SyncShipmentTrackingUseCase {
  private tracking = new BiteshipTrackingService()

  public async execute(args: SyncArgs): Promise<void> {
    const trxModel = args.transaction
    if (!trxModel) return

    const shipment =
      args.shipment ??
      (Array.isArray((trxModel as any)?.shipments) ? (trxModel as any).shipments[0] : null)

    if (!shipment) return

    try {
      await this.tracking.syncIfPossible(trxModel, shipment, args.trx)
    } catch (e: any) {
      if (!args.silent) {
        console.log('SyncShipmentTrackingUseCase error:', e?.response?.data || e?.message || e)
      }
    }
  }
}
