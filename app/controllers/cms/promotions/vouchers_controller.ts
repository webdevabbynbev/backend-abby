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

  private trimmedOrEmpty(v: any): string {
    return String(v ?? '').trim()
  }

  /**
   * Convert input uang jadi digits-only yang STABIL:
   * - "350.000" => "350000"
   * - "Rp 350.000" => "350000"
   * - "350000.00" / "350000.0" => "350000" (biar ga nambah nol tiap edit)
   * Return "" kalau kosong.
   */
  private moneyDigits(v: any): string {
    const s = String(v ?? '').trim()
    if (!s) return ''
    const withoutDecimal = s.replace(/([.,]\d{1,2})$/, '')
    return withoutDecimal.replace(/[^\d]/g, '')
  }

  /**
   * Deteksi tipe kolom is_active pakai schema (lebih akurat dari baca 1 row).
   * Postgres / Supabase friendly.
   */
  private async detectIsActiveBoolean() {
    if (typeof this.isActiveIsBoolean === 'boolean') return this.isActiveIsBoolean

    try {
      const res: any = await db.rawQuery(
        `
        select data_type
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = ?
          and column_name = ?
        limit 1
        `,
        ['vouchers', 'is_active']
      )

      const dt = String(res?.rows?.[0]?.data_type ?? '').toLowerCase()
      this.isActiveIsBoolean = dt === 'boolean'
    } catch {
      this.isActiveIsBoolean = false
    }

    return this.isActiveIsBoolean
  }

  /**
   * Input dari CMS biasanya 1/2, tapi kadang bisa boolean/string.
   * Kalau kosong -> default ACTIVE (biar ga kebalik).
   */
  private normalizeStatusInput(raw: any): { bool: boolean; num: 1 | 2 } {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return { bool: true, num: 1 }
    }

    if (raw === true) return { bool: true, num: 1 }
    if (raw === false) return { bool: false, num: 2 }

    const s = String(raw ?? '').trim().toLowerCase()
    if (s === 'true' || s === 'active') return { bool: true, num: 1 }
    if (s === 'false' || s === 'inactive' || s === 'non active') return { bool: false, num: 2 }

    const n = Number(raw)
    if (Number.isNaN(n)) throw new Error('Invalid status')

    return n === 1 ? { bool: true, num: 1 } : { bool: false, num: 2 }
  }

  /**
   * Paksa output isActive selalu 1/2 supaya UI yang cek `=== 1` jalan.
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
    return { ...v, isActive: this.toIsActiveNumber(raw) }
  }

  private async emitActivitySafe(payload: any) {
    try {
      // @ts-ignore
      await emitter.emit('set:activity-log', payload)
    } catch {
      // jangan bikin request 500 gara-gara activity log
    }
  }

  public async get({ response, request }: HttpContext) {
    try {
      const qs = request.qs()
      const keyword = String(qs?.name ?? qs?.q ?? '').trim()
      const page = this.parseIntOr(qs.page, 1)
      const perPage = this.parseIntOr(qs.per_page, 10)

      const dataVoucher = await Voucher.query()
        .apply((scopes) => scopes.active()) // biasanya filter deleted_at
        .if(keyword.length > 0, (query) => {
          query.whereILike('name', `%${keyword}%`).orWhereILike('code', `%${keyword}%`)
        })
        .orderBy('created_at', 'desc')
        .paginate(page, perPage)

      const json = dataVoucher.toJSON()
      const normalized = (json.data || []).map((v: any) => this.normalizeVoucherOutput(v))

      return response.status(200).send({
        message: 'success',
        serve: { data: normalized, ...json.meta },
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

      const name = this.trimmedOrEmpty(request.input('name'))
      const code = this.trimmedOrEmpty(request.input('code'))
      if (!name || !code) {
        return response.status(422).send({ message: 'name and code are required.', serve: [] })
      }

      const isBool = await this.detectIsActiveBoolean()
      const status = this.normalizeStatusInput(request.input('is_active'))

      const isPercentage = Number(request.input('is_percentage') ?? 1)
      const pctRaw = request.input('percentage')
      const pct = pctRaw === undefined || pctRaw === null || String(pctRaw).trim() === '' ? null : Number(pctRaw)

      const dataVoucher = new Voucher()
      dataVoucher.name = name
      dataVoucher.code = code
      dataVoucher.type = request.input('type')
      dataVoucher.qty = request.input('qty')
      dataVoucher.expiredAt = request.input('expired_at')
      dataVoucher.startedAt = request.input('started_at')
      dataVoucher.isPercentage = isPercentage
      ;(dataVoucher as any).percentage = pct

      if (isPercentage === 1) {
        const mdp = this.moneyDigits(request.input('max_disc_price'))
        ;(dataVoucher as any).maxDiscPrice = mdp ? mdp : null
        ;(dataVoucher as any).price = null
      } else {
        const price = this.moneyDigits(request.input('price'))
        ;(dataVoucher as any).price = price ? price : null
        ;(dataVoucher as any).maxDiscPrice = null
        ;(dataVoucher as any).percentage = null
      }

      ;(dataVoucher as any).isActive = isBool ? status.bool : status.num
      await dataVoucher.save()

      await this.emitActivitySafe({
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Voucher ${dataVoucher.name}`,
        menu: 'Voucher',
        data: dataVoucher.toJSON(),
      })

      return response.status(200).send({
        message: 'Successfully created.',
        serve: this.normalizeVoucherOutput(dataVoucher.toJSON()),
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

      const id = request.input('id')
      if (!id) return response.status(422).send({ message: 'id is required.', serve: [] })

      const dataVoucher = await Voucher.query().where('id', id).first()
      if (!dataVoucher) {
        return response.status(404).send({
          message: 'Voucher not found.',
          serve: [],
        })
      }

      const name = this.trimmedOrEmpty(request.input('name'))
      const code = this.trimmedOrEmpty(request.input('code'))
      if (!name || !code) {
        return response.status(422).send({ message: 'name and code are required.', serve: [] })
      }

      const oldData = dataVoucher.toJSON()
      const isBool = await this.detectIsActiveBoolean()
      const status = this.normalizeStatusInput(request.input('is_active'))

      const isPercentage = Number(request.input('is_percentage') ?? dataVoucher.isPercentage ?? 1)
      const pctRaw = request.input('percentage')
      const pct = pctRaw === undefined || pctRaw === null || String(pctRaw).trim() === '' ? null : Number(pctRaw)

      dataVoucher.name = name
      dataVoucher.code = code
      dataVoucher.type = request.input('type')
      dataVoucher.qty = request.input('qty')
      dataVoucher.expiredAt = request.input('expired_at')
      dataVoucher.startedAt = request.input('started_at')
      dataVoucher.isPercentage = isPercentage
      ;(dataVoucher as any).percentage = pct

      if (isPercentage === 1) {
        const mdp = this.moneyDigits(request.input('max_disc_price'))
        ;(dataVoucher as any).maxDiscPrice = mdp ? mdp : null
        ;(dataVoucher as any).price = null
      } else {
        const price = this.moneyDigits(request.input('price'))
        ;(dataVoucher as any).price = price ? price : null
        ;(dataVoucher as any).maxDiscPrice = null
        ;(dataVoucher as any).percentage = null
      }

      ;(dataVoucher as any).isActive = isBool ? status.bool : status.num
      await dataVoucher.save()

      await this.emitActivitySafe({
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Voucher ${oldData.name}`,
        menu: 'Voucher',
        data: { old: oldData, new: dataVoucher.toJSON() },
      })

      return response.status(200).send({
        message: 'Successfully updated.',
        serve: this.normalizeVoucherOutput(dataVoucher.toJSON()),
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

      await this.emitActivitySafe({
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
      const rawStatus = request.input('status') ?? request.input('is_active') ?? request.input('isActive')

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

      await this.emitActivitySafe({
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Status Voucher ${dataVoucher.name}`,
        menu: 'Voucher',
        data: dataVoucher.toJSON(),
      })

      return response.status(200).send({
        message: 'Successfully updated.',
        serve: this.normalizeVoucherOutput(dataVoucher.toJSON()),
      })
    } catch (error: AnyError) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
