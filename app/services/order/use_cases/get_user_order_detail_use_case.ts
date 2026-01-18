import { OrderReadRepository } from '#services/order/order_read_repository'
import { SyncShipmentTrackingUseCase } from '#services/shipping/use_cases/sync_shipment_tracking_use_case'

type Args = {
  userId: number
  transactionNumber: string
  syncTracking?: boolean
}

export class GetUserOrderDetailUseCase {
  private repo = new OrderReadRepository()
  private syncTracking = new SyncShipmentTrackingUseCase()

  public async execute(args: Args) {
    const transactionNumber = String(args.transactionNumber || '').trim()
    if (!transactionNumber) {
      const err: any = new Error('transactionNumber invalid')
      err.httpStatus = 400
      throw err
    }

    let dataTransaction = await this.repo.findDetailByTransactionNumberForUser(args.userId, transactionNumber)

    if (!dataTransaction) {
      const err: any = new Error('Transaction not found.')
      err.httpStatus = 400
      throw err
    }

    if (args.syncTracking) {
      try {
        const trxModel: any = (dataTransaction as any)?.transaction
        const shipFromTrx = Array.isArray(trxModel?.shipments) ? trxModel.shipments[0] : null
        const shipFromEco = Array.isArray((dataTransaction as any)?.shipments)
          ? (dataTransaction as any).shipments[0]
          : null

        const shipment = shipFromTrx || shipFromEco

        if (trxModel && shipment) {
          await this.syncTracking.execute({ transaction: trxModel, shipment, silent: true })

          dataTransaction = await this.repo.findDetailByTransactionNumberForUser(args.userId, transactionNumber)
        }
      } catch {
      }
    }

    return { dataTransaction, waybill: null }
  }
}
