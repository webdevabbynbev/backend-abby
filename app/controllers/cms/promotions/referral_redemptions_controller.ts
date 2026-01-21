import type { HttpContext } from '@adonisjs/core/http'
import ReferralRedemption from '#models/referral_redemption'
import { DateTime } from 'luxon'

export default class ReferralRedemptionsController {

  async index({ request }: HttpContext) {
    const page = Number(request.input('page', 1))
    const perPage = Number(request.input('per_page', 20))

    const q = String(request.input('q', '')).trim().toUpperCase()
    const status = request.input('status', null)
    const referralCodeId = request.input('referral_code_id', null)
    const userId = request.input('user_id', null)
    const transactionId = request.input('transaction_id', null)

    const dateFromRaw = request.input('date_from', null)
    const dateToRaw = request.input('date_to', null)

    const preload = String(request.input('preload', '0')) === '1'

    const query = ReferralRedemption.query()

    if (q) query.where('referral_code', 'ilike', `%${q}%`) // Postgres
    if (status !== null && status !== undefined && status !== '') query.where('status', Number(status))
    if (referralCodeId) query.where('referral_code_id', Number(referralCodeId))
    if (userId) query.where('user_id', Number(userId))
    if (transactionId) query.where('transaction_id', Number(transactionId))

    // filter by created_at range (timezone Jakarta)
    if (dateFromRaw) {
      const from = DateTime.fromISO(String(dateFromRaw), { zone: 'Asia/Jakarta' }).startOf('day')
      query.where('created_at', '>=', from.toSQL()!)
    }
    if (dateToRaw) {
      const to = DateTime.fromISO(String(dateToRaw), { zone: 'Asia/Jakarta' }).endOf('day')
      query.where('created_at', '<=', to.toSQL()!)
    }

    if (preload) {
      query.preload('codeRef').preload('user').preload('transaction')
    }

    return query.orderBy('id', 'desc').paginate(page, perPage)
  }

  async stats({ request }: HttpContext) {
    const referralCodeId = request.input('referral_code_id', null)
    const dateFromRaw = request.input('date_from', null)
    const dateToRaw = request.input('date_to', null)

    const base = ReferralRedemption.query()

    if (referralCodeId) base.where('referral_code_id', Number(referralCodeId))
    if (dateFromRaw) {
      const from = DateTime.fromISO(String(dateFromRaw), { zone: 'Asia/Jakarta' }).startOf('day')
      base.where('created_at', '>=', from.toSQL()!)
    }
    if (dateToRaw) {
      const to = DateTime.fromISO(String(dateToRaw), { zone: 'Asia/Jakarta' }).endOf('day')
      base.where('created_at', '<=', to.toSQL()!)
    }

    // clone query (lucid gak punya clone built-in yang nyaman di semua versi)
    const rows = await base.select('status')

    let pending = 0
    let success = 0
    let canceled = 0

    for (const r of rows as any[]) {
      const s = Number(r.status)
      if (s === 0) pending++
      else if (s === 1) success++
      else if (s === 2) canceled++
    }

    return {
      total: pending + success + canceled,
      pending,
      success,
      canceled,
    }
  }
}
