import db from '@adonisjs/lucid/services/db'
import Transaction from '#models/transaction'
import { TransactionStatus } from '#enums/transaction_status'
import { OrderNotificationService } from '#services/notification/order_notification_service'
import NumberUtils from '#utils/number'

type Args = {
  userId: number
  transactionNumber: string
}

export class ConfirmUserOrderCompletedUseCase {
  private notifier = new OrderNotificationService()

  public async execute(args: Args) {
    const userId = NumberUtils.toNumber(args.userId, 0)
    const transactionNumber = String(args.transactionNumber || '').trim()

    if (!userId) {
      const err: any = new Error('Unauthorized')
      err.httpStatus = 401
      throw err
    }

    if (!transactionNumber) {
      const err: any = new Error('transactionNumber invalid')
      err.httpStatus = 400
      throw err
    }

    let notifyUser: any = null

    const updated = await db.transaction(async (trx) => {
      const transaction = await Transaction.query({ client: trx })
        .where('transaction_number', transactionNumber)
        .where('user_id', userId)
        .forUpdate()
        .preload('shipments')
        .first()

      if (!transaction) {
        const err: any = new Error('Transaction not found.')
        err.httpStatus = 404
        throw err
      }

      if (Number(transaction.transactionStatus) !== TransactionStatus.ON_DELIVERY) {
        const err: any = new Error('Pesanan belum dikirim, belum bisa dikonfirmasi selesai.')
        err.httpStatus = 400
        throw err
      }

      transaction.transactionStatus = TransactionStatus.COMPLETED.toString()
      await transaction.useTransaction(trx).save()

      const shipment: any = transaction.shipments?.[0]
      if (shipment) {
        shipment.status = 'delivered'
        await shipment.useTransaction(trx).save()
      }

      // ambil user untuk notifikasi (pakai transaksi yang sama)
      const user = await transaction
        .related('user')
        .query()
        .useTransaction(trx)
        .first()

      if (user) {
        notifyUser = {
          email: user.email,
          name: user.name,
          phoneNumber: (user as any).phoneNumber,
        }
      }

      return transaction
    })

    // side-effect setelah transaksi, best-effort
    try {
      await this.notifier.sendTransactionSuccess(notifyUser, updated)
    } catch {
      // ignore
    }

    return updated
  }
}
