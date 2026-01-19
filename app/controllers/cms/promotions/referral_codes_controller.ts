import type { HttpContext } from '@adonisjs/core/http'
import ReferralCode from '#models/referral_code'
import { DateTime } from 'luxon'

export default class ReferralCodesController {
  async index({ request }: HttpContext) {
    const page = Number(request.input('page', 1))
    const perPage = Number(request.input('per_page', 20))

    const q = String(request.input('q', '')).trim().toUpperCase()
    const isActive = request.input('is_active', null)

    const query = ReferralCode.query().whereNull('deleted_at')

    if (q) query.where('code', 'ilike', `%${q}%`) // Postgres. Kalau MySQL: 'like'
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      query.where('is_active', Number(isActive) ? 1 : 0)
    }

    const data = await query.orderBy('id', 'desc').paginate(page, perPage)
    return data
  }

  async store({ request, response }: HttpContext) {
    const code = String(request.input('code', '')).trim().toUpperCase()
    const discountPercent = Number(request.input('discount_percent', 0))
    const isActive = Boolean(Number(request.input('is_active', 1)))

    const startedAt = request.input('started_at') ? DateTime.fromISO(request.input('started_at')) : null
    const expiredAt = request.input('expired_at') ? DateTime.fromISO(request.input('expired_at')) : null

    if (!code) return response.badRequest({ message: 'code wajib diisi' })
    if (!/^[A-Z0-9]{3,32}$/.test(code)) {
      return response.badRequest({ message: 'code harus alphanumeric uppercase (3-32 karakter)' })
    }
    if (!(discountPercent > 0 && discountPercent <= 100)) {
      return response.badRequest({ message: 'discount_percent harus 0-100' })
    }
    if (startedAt && expiredAt && expiredAt <= startedAt) {
      return response.badRequest({ message: 'expired_at harus > started_at' })
    }

    const exists = await ReferralCode.query().where('code', code).whereNull('deleted_at').first()
    if (exists) return response.badRequest({ message: 'code sudah dipakai' })

    const r = new ReferralCode()
    r.code = code
    r.discountPercent = discountPercent
    r.isActive = isActive
    r.startedAt = startedAt
    r.expiredAt = expiredAt
    await r.save()

    return r
  }

  async update({ params, request, response }: HttpContext) {
    const id = Number(params.id)
    const r = await ReferralCode.query().where('id', id).whereNull('deleted_at').first()
    if (!r) return response.notFound({ message: 'referral code tidak ditemukan' })

    const code = request.input('code')
    const discountPercent = request.input('discount_percent')
    const isActive = request.input('is_active')
    const startedAt = request.input('started_at')
    const expiredAt = request.input('expired_at')

    if (code !== undefined) {
      const norm = String(code || '').trim().toUpperCase()
      if (!norm) return response.badRequest({ message: 'code tidak boleh kosong' })
      if (!/^[A-Z0-9]{3,32}$/.test(norm)) {
        return response.badRequest({ message: 'code harus alphanumeric uppercase (3-32 karakter)' })
      }
      const exists = await ReferralCode.query()
        .where('code', norm)
        .whereNull('deleted_at')
        .whereNot('id', r.id)
        .first()
      if (exists) return response.badRequest({ message: 'code sudah dipakai' })
      r.code = norm
    }

    if (discountPercent !== undefined) {
      const p = Number(discountPercent)
      if (!(p > 0 && p <= 100)) {
        return response.badRequest({ message: 'discount_percent harus 0-100' })
      }
      r.discountPercent = p
    }

    if (isActive !== undefined) {
      r.isActive = Boolean(Number(isActive))
    }

    if (startedAt !== undefined) {
      r.startedAt = startedAt ? DateTime.fromISO(String(startedAt)) : null
    }

    if (expiredAt !== undefined) {
      r.expiredAt = expiredAt ? DateTime.fromISO(String(expiredAt)) : null
    }

    if (r.startedAt && r.expiredAt && r.expiredAt <= r.startedAt) {
      return response.badRequest({ message: 'expired_at harus > started_at' })
    }

    await r.save()
    return r
  }

  async toggleStatus({ params, request, response }: HttpContext) {
    const id = Number(params.id)
    const r = await ReferralCode.query().where('id', id).whereNull('deleted_at').first()
    if (!r) return response.notFound({ message: 'referral code tidak ditemukan' })

    const isActive = request.input('is_active')
    if (isActive === undefined) return response.badRequest({ message: 'is_active wajib diisi' })

    r.isActive = Boolean(Number(isActive))
    await r.save()
    return r
  }
}
