import { BiteshipClient } from './biteship_client.js'
import { normalizeBiteshipError } from './biteship_errors.js'

export type BiteshipRateItem = {
  name: string
  description?: string
  value: number
  quantity: number
  weight: number // gram
  length?: number
  width?: number
  height?: number
}

export type BiteshipCourierRatesPayload = {
  origin_postal_code?: number
  destination_postal_code?: number

  origin_area_id?: string
  destination_area_id?: string

  origin_latitude?: number
  origin_longitude?: number
  destination_latitude?: number
  destination_longitude?: number

  couriers: string
  items: BiteshipRateItem[]
  courier_insurance?: number
}

export type BiteshipCourierRatesResponse = {
  pricing?: unknown[]
  [key: string]: unknown
}

export class BiteshipRatesService {
  constructor(private api: BiteshipClient = new BiteshipClient()) {}

  public async getCourierRates(payload: BiteshipCourierRatesPayload): Promise<BiteshipCourierRatesResponse> {
    try {
      const couriers = String(payload?.couriers || '').trim()
      const items = Array.isArray(payload?.items) ? payload.items : []

      if (!couriers) {
        const err: any = new Error('couriers is required')
        err.httpStatus = 400
        throw err
      }

      if (items.length === 0) {
        const err: any = new Error('items is required')
        err.httpStatus = 400
        throw err
      }

      const res = await this.api.http.post('/rates/couriers', { ...payload, couriers, items })
      return (res?.data ?? {}) as BiteshipCourierRatesResponse
    } catch (e) {
      throw normalizeBiteshipError(e)
    }
  }

  public async getCourierPricing(payload: BiteshipCourierRatesPayload) {
    const data = await this.getCourierRates(payload)
    return Array.isArray((data as any)?.pricing) ? ((data as any).pricing as any[]) : []
  }
}
