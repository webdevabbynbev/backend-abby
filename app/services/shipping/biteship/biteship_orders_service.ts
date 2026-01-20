import { BiteshipClient } from './biteship_client.js'
import { normalizeBiteshipError } from './biteship_errors.js'

function normalizeCourierCode(input: string) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return ''

  const first = raw.split(/[\s\-_]+/).filter(Boolean)[0] || ''

  // optional alias cleanup
  if (first === 'j&t' || first === 'jt') return 'jnt'
  if (first === 'jnt' || first === 'jntexpress') return 'jnt'

  return first
}

export class BiteshipOrdersService {
  constructor(private api: BiteshipClient = new BiteshipClient()) {}

  public async createOrder(payload: any) {
    try {
      const res = await this.api.http.post('/orders', payload)
      return res.data
    } catch (e) {
      throw normalizeBiteshipError(e)
    }
  }

  public async getOrderDetail(orderId: string) {
    try {
      const id = String(orderId || '').trim()
      if (!id) {
        const err: any = new Error('orderId is required')
        err.httpStatus = 400
        throw err
      }

      const res = await this.api.http.get(`/orders/${id}`)
      return res.data
    } catch (e) {
      throw normalizeBiteshipError(e)
    }
  }

  public async getTrackingByWaybill(waybill: string, courierCode: string) {
    try {
      const wb = String(waybill || '').trim()
      const courier = normalizeCourierCode(courierCode)

      if (!wb) {
        const err: any = new Error('waybill is required')
        err.httpStatus = 400
        throw err
      }

      if (!courier) {
        const err: any = new Error('courierCode is required')
        err.httpStatus = 400
        throw err
      }

      const res = await this.api.http.get(`/trackings/${courier}/${wb}`)
      return res.data
    } catch (e) {
      throw normalizeBiteshipError(e)
    }
  }

  public async cancelOrder(orderId: string) {
    try {
      const id = String(orderId || '').trim()
      if (!id) {
        const err: any = new Error('orderId is required')
        err.httpStatus = 400
        throw err
      }

      const res = await this.api.http.post(`/orders/${id}/cancel`)
      return res.data
    } catch (e) {
      throw normalizeBiteshipError(e)
    }
  }

  // expose normalizer if needed elsewhere (optional)
  public static normalizeCourierCode = normalizeCourierCode
}
