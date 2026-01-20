import axios from 'axios'
import env from '#start/env'
import { createHash, timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'

export class MidtransService {
  getSnapUrl() {
    return env.get('MIDTRANS_ENV') === 'production'
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions'
  }

  async createSnapTransaction(transactionNumber: string, grossAmount: number, user: any) {
    const expiryMinutes = Number(env.get('MIDTRANS_SNAP_EXPIRY_MINUTES') ?? 1440) // default 24 jam
    const startTime = DateTime.now()
      .setZone('Asia/Jakarta')
      .toFormat('yyyy-LL-dd HH:mm:ss ZZZ') // contoh: 2026-01-20 10:00:00 +0700

    const parameter: any = {
      transaction_details: {
        order_id: transactionNumber,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: user.firstName || user.email,
        last_name: user.lastName || '',
        email: user.email,
        phone: user.phoneNumber || '',
      },

      // ✅ Custom Transaction Expiry (Midtrans Snap)
      // start_time disarankan biar expiry mulai dari saat token dibuat, bukan nunggu user confirm metode bayar
      expiry: {
        start_time: startTime,
        unit: 'minutes',
        duration: Math.max(1, Math.floor(expiryMinutes)),
      },
    }

    const serverKey = String(env.get('MIDTRANS_SERVER_KEY') ?? '')
    if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY is not set')
    const authString = Buffer.from(`${serverKey}:`).toString('base64')

    const { data: snap } = await axios.post(this.getSnapUrl(), parameter, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${authString}`,
      },
    })

    return { token: snap.token, redirect_url: snap.redirect_url }
  }

  verifySignature(payload: any) {
    const orderId = String(payload?.order_id ?? '')
    const statusCode = String(payload?.status_code ?? '')
    const grossAmount = String(payload?.gross_amount ?? '')
    const signatureKey = String(payload?.signature_key ?? '')

    const serverKey = String(env.get('MIDTRANS_SERVER_KEY') ?? '')

    if (!orderId || !statusCode || !grossAmount || !signatureKey || !serverKey) return false

    const raw = `${orderId}${statusCode}${grossAmount}${serverKey}`
    const expected = createHash('sha512').update(raw).digest('hex')

    const a = Buffer.from(signatureKey)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }

  normalizeStatus(v: any) {
    return String(v || '').trim().toLowerCase()
  }

  pickReceipt(payload: any) {
    return (
      payload?.transaction_id ||
      payload?.va_numbers?.[0]?.va_number ||
      payload?.permata_va_number ||
      payload?.bill_key ||
      payload?.biller_code ||
      null
    )
  }
}
