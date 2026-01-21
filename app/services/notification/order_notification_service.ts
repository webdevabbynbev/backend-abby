import Transaction from '#models/transaction'
import WhatsAppService from '#services/whatsapp_api_service'

type NotifyUser = {
  email: string
  name: string
  phoneNumber?: string | null
}

export class OrderNotificationService {
  public async sendTransactionSuccess(user: NotifyUser | null, transaction: Transaction) {
    if (!user) return

    const phone = String(user.phoneNumber || '').trim()

    // 1) coba WhatsApp dulu kalau ada nomor
    if (phone) {
      try {
        const wa = new WhatsAppService()
        await wa.sendTransactionSuccess(wa.normalizeNumber(phone), transaction.transactionNumber)
        return
      } catch (e) {
        // fallback ke email
      }
    }

    // 2) fallback email
    try {
      await transaction.sendTransactionEmail(
        { email: user.email, name: user.name },
        'Success',
        'emails/transaction_success'
      )
    } catch (mailError) {
      console.error('Gagal kirim notifikasi transaksi sukses:', mailError)
    }
  }
}
