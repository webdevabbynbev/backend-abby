import Voucher from '#models/voucher'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { create } from '#validators/voucher'
import emitter from '@adonisjs/core/services/emitter'

type AnyError = any

export default class VouchersController {
  private isActiveIsBoolean: boolean | null = null

  private parseIntOr(value: any, fallback: number) {
    const n = Number.parseInt(String(value ?? ''), 10)
    return Number.isNaN(n) ? fallback : n
  }

  /**
   * Deteksi tipe kolom is_active di DB (boolean atau number)
   * Aman karena data voucher kamu sudah ada.
   */
  private async detectIsActiveBoolean() {
    if (typeof this.isActiveIsBoolean === 'boolean') return this.isActiveIsBoolean

    try {
      const row = await db.from('vouchers').select('is_active').first()
      const v = row?.is_active
      this.isActiveIsBoolean = typeof v === 'boolean'
    } catch {
      // fallback: anggap number
      this.isActiveIsBoolean = false
    }

    return this.isActiveIsBoolean
  }

  /**
   * Input dari CMS biasanya 1/2, tapi kadang bisa boolean/string.
   * Return:
   *  - bool: true/false
   *  - num: 1 (active) atau 2 (inactive)
   */
  private normalizeStatusInput(raw: any): { bool: boolean; num: 1 | 2 } {
    if (raw === true) return { bool: true, num: 1 }
    if (raw === false) return { bool: false, num: 2 }

    const s = String(raw ?? '').trim().toLowerCase()
    if (s === 'true' || s === 'active') return { bool: true, num: 1 }
    if (s === 'false' || s === 'inactive' || s === 'non active') return { bool: false, num: 2 }

    const n = Number(raw)
    if (Number.isNaN(n)) throw new Error('Invalid status')

    // CMS: 1 = active, 2 = inactive
    if (n === 1) return { bool: true, num: 1 }
    return { bool: false, num: 2 } // 0/2/else => inactive
  }

  /**
   * Paksa output isActive selalu 1/2 supaya UI kamu yang cek `=== 1` jalan.
   * Kalau data dari DB boolean, bakal dikonversi.
   */
  private toIsActiveNumber(value: any): 1 | 2 {
    if (value === true) return 1
    if (value === false) return 2

    const n = Number(value)
    if (Number.isNaN(n)) return 2
    return n === 1 ? 1 : 2
  }

  private normalizeVoucherOutput(v: any) {
    const raw = v?.isActive ?? v?.is_active
    return {
      ...v,
      isActive: this.toIsActiveNumber(raw),
    }
  }

  public async get({ response, request }: HttpContext) {
    try {
      const qs = request.qs()
      const keyword = String(qs?.name ?? qs?.q ?? '').trim()
      const page = this.parseIntOr(qs.page, 1)
      const perPage = this.parseIntOr(qs.per_page, 10)

      const dataVoucher = await Voucher.query()
        .apply((scopes) => scopes.active()) // NOTE: ini cuma filter deleted_at
        .if(keyword.length > 0, (query) => {
          query.whereILike('name', `%${keyword}%`)
        })
        .orderBy('created_at', 'desc')
        .paginate(page, perPage)

      const json = dataVoucher.toJSON()
      const normalized = (json.data || []).map((v: any) => this.normalizeVoucherOutput(v))

      return response.status(200).send({
        message: 'success',
        serve: {
          data: normalized,
          ...json.meta,
        },
      })
    } catch (error: AnyError) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async create({ response, request, auth }: HttpContext) {
    try {
      const data = request.all()

      try {
        await create.validate(data)
      } catch (err: AnyError) {
        return response.status(422).send({
          message:
            err.messages?.length > 0
              ? err.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: [],
        })
      }

      const isBool = await this.detectIsActiveBoolean()
      const status = this.normalizeStatusInput(request.input('is_active'))

      const dataVoucher = new Voucher()
      dataVoucher.name = request.input('name')
      dataVoucher.code = request.input('code')
      dataVoucher.price = request.input('price')
      ;(dataVoucher as any).isActive = isBool ? status.bool : status.num
      dataVoucher.type = request.input('type')
      dataVoucher.qty = request.input('qty')
      dataVoucher.expiredAt = request.input('expired_at')
      dataVoucher.startedAt = request.input('started_at')
      dataVoucher.maxDiscPrice = request.input('max_disc_price')
      dataVoucher.percentage = request.input('percentage')
      dataVoucher.isPercentage = request.input('is_percentage')
      await dataVoucher.save()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Voucher ${dataVoucher.name}`,
        menu: 'Voucher',
        data: dataVoucher.toJSON(),
      })

      // normalize output buat UI
      const out = this.normalizeVoucherOutput(dataVoucher.toJSON())

      return response.status(200).send({
        message: 'Successfully created.',
        serve: out,
      })
    } catch (error: AnyError) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async update({ response, request, auth }: HttpContext) {
    try {
      const data = request.all()

      try {
        await create.validate(data)
      } catch (err: AnyError) {
        return response.status(422).send({
          message:
            err.messages?.length > 0
              ? err.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: [],
        })
      }

      const dataVoucher = await Voucher.query().where('id', request.input('id')).first()
      if (!dataVoucher) {
        return response.status(404).send({
          message: 'Voucher not found.',
          serve: [],
        })
      }

      const oldData = dataVoucher.toJSON()
      const isBool = await this.detectIsActiveBoolean()
      const status = this.normalizeStatusInput(request.input('is_active'))

      dataVoucher.name = request.input('name')
      dataVoucher.code = request.input('code')
      dataVoucher.price = request.input('price')
      ;(dataVoucher as any).isActive = isBool ? status.bool : status.num
      dataVoucher.type = request.input('type')
      dataVoucher.qty = request.input('qty')
      dataVoucher.expiredAt = request.input('expired_at')
      dataVoucher.startedAt = request.input('started_at')
      dataVoucher.maxDiscPrice = request.input('max_disc_price')
      dataVoucher.percentage = request.input('percentage')
      dataVoucher.isPercentage = request.input('is_percentage')
      await dataVoucher.save()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Voucher ${oldData.name}`,
        menu: 'Voucher',
        data: { old: oldData, new: dataVoucher.toJSON() },
      })

      const out = this.normalizeVoucherOutput(dataVoucher.toJSON())

      return response.status(200).send({
        message: 'Successfully updated.',
        serve: out,
      })
    } catch (error: AnyError) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async delete({ response, request, auth }: HttpContext) {
    try {
      const voucher = await Voucher.query().where('id', request.input('id')).first()
      if (!voucher) {
        return response.status(422).send({
          message: 'Invalid data.',
          serve: [],
        })
      }

      await voucher.softDelete()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Delete Voucher ${voucher.name}`,
        menu: 'Voucher',
        data: voucher.toJSON(),
      })

      return response.status(200).send({
        message: 'Successfully deleted.',
        serve: [],
      })
    } catch (error: AnyError) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async updateStatus({ response, request, auth }: HttpContext) {
    try {
      const id = request.input('id')
      const rawStatus =
        request.input('status') ?? request.input('is_active') ?? request.input('isActive')

      if (!id || rawStatus === undefined || rawStatus === null) {
        return response.status(422).send({
          message: 'id and status are required.',
          serve: [],
        })
      }

      const dataVoucher = await Voucher.query().where('id', id).first()
      if (!dataVoucher) {
        return response.status(404).send({
          message: 'Voucher not found.',
          serve: [],
        })
      }

      const isBool = await this.detectIsActiveBoolean()
      const status = this.normalizeStatusInput(rawStatus)

      ;(dataVoucher as any).isActive = isBool ? status.bool : status.num
      await dataVoucher.save()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Status Voucher ${dataVoucher.name}`,
        menu: 'Voucher',
        data: dataVoucher.toJSON(),
      })

      const out = this.normalizeVoucherOutput(dataVoucher.toJSON())

      return response.status(200).send({
        message: 'Successfully updated.',
        serve: out,
      })
    } catch (error: AnyError) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
