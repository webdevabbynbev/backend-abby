import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import ExcelJS from 'exceljs'
import fs from 'fs'

import CsvReader from '#services/product_csv_import/csv_reader'
import {
  DiscountCmsService,
  PromoConflictError,
} from '#services/discount/discount_cms_service'
import ProductVariant from '#models/product_variant'

function cleanupFile(filePath?: string) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

function csvEscape(v: any) {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function normHeader(h: any) {
  return String(h || '').replace(/^\uFEFF/, '').trim().toLowerCase()
}

function toNumOrNull(v: any) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toIntOrNull(v: any) {
  const n = toNumOrNull(v)
  if (n === null) return null
  const i = Math.trunc(n)
  return Number.isFinite(i) ? i : null
}

function toIsActiveRaw(v: any) {
  if (v === null || v === undefined || v === '') return undefined
  const s = String(v).trim().toLowerCase()
  if (s === '1' || s === 'true' || s === 'aktif' || s === 'active' || s === 'yes') return 1
  if (s === '0' || s === 'false' || s === 'nonaktif' || s === 'inactive' || s === 'no') return 0
  const n = Number(v)
  if (Number.isFinite(n)) return n
  return v
}

function toValueTypeRaw(v: any) {
  if (v === null || v === undefined || v === '') return undefined
  const s = String(v).trim().toLowerCase()
  if (s === 'fixed' || s === 'nominal') return 'fixed'
  if (s === 'percent' || s === 'persen') return 'percent'
  const n = Number(v)
  if (Number.isFinite(n)) return n
  return v
}

function calcFinalPrice(base: number, valueType: any, value: any, maxDiscount: any) {
  if (!Number.isFinite(base) || base <= 0) return Number(base || 0) || 0

  const vt = String(valueType || '').trim().toLowerCase()
  const v = Number(value || 0) || 0

  let disc = 0
  if (vt === 'fixed') {
    disc = Math.min(Math.max(0, v), base)
  } else if (vt === 'percent') {
    disc = (base * Math.max(0, v)) / 100
    const md =
      maxDiscount === null || maxDiscount === undefined || maxDiscount === '' ? null : Number(maxDiscount)
    if (md !== null && Number.isFinite(md) && md >= 0) disc = Math.min(disc, md)
  } else {
    disc = 0
  }

  const final = base - disc
  return final < 0 ? 0 : final
}

async function readXlsx(filePath: string): Promise<any[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const ws = wb.worksheets[0]
  if (!ws) return []

  const headerRow = ws.getRow(1)
  const headers: string[] = []
  headerRow.eachCell((cell, col) => {
    const raw =
      typeof cell.value === 'object' && cell.value !== null
        ? (cell.value as any).text ?? (cell.value as any).result ?? String(cell.value)
        : cell.value
    headers[col - 1] = normHeader(raw)
  })

  const rows: any[] = []
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i)
    if (!r || !r.cellCount) continue

    const obj: any = {}
    for (let c = 1; c <= headers.length; c++) {
      const key = headers[c - 1]
      if (!key) continue

      const cell = r.getCell(c)
      const val: any =
        typeof cell.value === 'object' && cell.value !== null
          ? (cell.value as any).result ?? (cell.value as any).text ?? String(cell.value)
          : cell.value

      obj[key] = val
    }

    const hasAny = Object.values(obj).some(
      (v) => v !== null && v !== undefined && String(v).trim() !== ''
    )
    if (hasAny) rows.push(obj)
  }

  return rows
}

export default class DiscountsController {
  private cms = new DiscountCmsService()

  public async get({ response, request }: HttpContext) {
    const { data, meta } = await this.cms.list(request.qs())

    return response.status(200).send({
      message: 'success',
      serve: { data, ...meta },
    })
  }

  public async show({ response, params }: HttpContext) {
    const serve = await this.cms.show(params.id)

    return response.status(200).send({
      message: 'success',
      serve,
    })
  }

  public async create({ response, request, auth }: HttpContext) {
    try {
      const discount = await this.cms.create(request.all())
      const d: any = discount

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Discount ${d?.name ?? d?.code ?? ''}`,
        menu: 'Discount',
        data: d?.toJSON ? d.toJSON() : d,
      })

      return response.status(200).send({
        message: 'Successfully created.',
        serve: discount,
      })
    } catch (error) {
      if (error instanceof PromoConflictError) {
        return response.status(409).send({
          message: error.message,
          serve: {
            code: 'PROMO_CONFLICT',
            conflicts: error.conflicts,
            canTransfer: error.canTransfer,
          },
        })
      }

      throw error
    }
  }

  public async update({ response, request, params, auth }: HttpContext) {
    try {
      const { discount, oldData } = await this.cms.update(params.id, request.all())
      const d: any = discount
      const od: any = oldData

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Discount ${od?.name ?? od?.code ?? ''}`,
        menu: 'Discount',
        data: {
          old: od,
          new: d?.toJSON ? d.toJSON() : d,
        },
      })

      return response.status(200).send({
        message: 'Successfully updated.',
        serve: discount,
      })
    } catch (error) {
      if (error instanceof PromoConflictError) {
        return response.status(409).send({
          message: error.message,
          serve: {
            code: 'PROMO_CONFLICT',
            conflicts: error.conflicts,
            canTransfer: error.canTransfer,
          },
        })
      }

      throw error
    }
  }

  public async delete({ response, params, auth }: HttpContext) {
    const discount = await this.cms.softDelete(params.id)
    const d: any = discount

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Delete Discount ${d?.name ?? d?.code ?? params.id}`,
      menu: 'Discount',
      data: d?.toJSON ? d.toJSON() : d,
    })

    return response.status(200).send({
      message: 'Successfully deleted.',
      serve: true,
    })
  }

  public async updateStatus({ response, request, auth }: HttpContext) {
    const discount = await this.cms.updateStatus(request.input('id'), request.input('is_active'))
    const d: any = discount

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Update Status Discount ${d?.name ?? d?.code ?? request.input('id')}`,
      menu: 'Discount',
      data: d?.toJSON ? d.toJSON() : d,
    })

    return response.status(200).send({
      message: 'Successfully updated.',
      serve: discount,
    })
  }

  public async exportItems({ response, request, params, auth }: HttpContext) {
    const format = String(request.input('format') || 'excel').trim().toLowerCase()
    const serve: any = await this.cms.show(params.id)

    const items: any[] = Array.isArray(serve?.variantItems) ? serve.variantItems : []
    const code = String(serve?.code ?? params.id ?? 'discount')
    const safeCode = code.replace(/[^a-zA-Z0-9-_]/g, '_')
    const ts = Date.now()

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Export Discount Items (${format.toUpperCase()}) ${safeCode}`,
      menu: 'Discount',
      data: { id: params.id, code, format, count: items.length },
    })

    const headers = ['sku', 'product', 'variant', 'base_price', 'harga_akhir', 'promo_stock']

    if (format === 'csv') {
      let csv = headers.join(',') + '\n'
      for (const it of items) {
        const base = Number(it?.price ?? it?.variant?.price ?? 0) || 0
        const finalPrice = calcFinalPrice(base, it?.valueType, it?.value, it?.maxDiscount)

        csv +=
          [
            csvEscape(it?.sku ?? it?.variant?.sku ?? ''),
            csvEscape(it?.productName ?? it?.variant?.product?.name ?? ''),
            csvEscape(it?.variantLabel ?? it?.variant?.label ?? ''),
            csvEscape(base),
            csvEscape(finalPrice),
            csvEscape(it?.promoStock ?? ''),
          ].join(',') + '\n'
      }

      response.header('Content-Type', 'text/csv')
      response.header('Content-Disposition', `attachment; filename="discount_items_${safeCode}_${ts}.csv"`)
      return response.send(csv)
    }

    // =======================
    // ✅ EXCEL EXPORT (FIXED)
    // =======================
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Discount Items')

    ws.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Variant', key: 'variant', width: 30 },
      { header: 'Base Price', key: 'base_price', width: 15 },
      { header: 'Harga Akhir', key: 'harga_akhir', width: 15 },
      { header: 'Promo Stock', key: 'promo_stock', width: 12 },
    ]

    for (const it of items) {
      const base = Number(it?.price ?? it?.variant?.price ?? 0) || 0
      const finalPrice = calcFinalPrice(base, it?.valueType, it?.value, it?.maxDiscount)

      ws.addRow({
        sku: String(it?.sku ?? it?.variant?.sku ?? ''),
        product: String(it?.productName ?? it?.variant?.product?.name ?? ''),
        variant: String(it?.variantLabel ?? it?.variant?.label ?? ''),
        base_price: Number(base),
        harga_akhir: Number(finalPrice),
        promo_stock: it?.promoStock ?? '',
      })
    }

    response.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response.header('Content-Disposition', `attachment; filename="discount_items_${safeCode}_${ts}.xlsx"`)
    
    const buf: any = await workbook.xlsx.writeBuffer()
    const out = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    return response.send(out)
  }

  public async importItems({ response, request, params, auth }: HttpContext) {
    const file = request.file('file', { extnames: ['csv', 'xlsx'], size: '20mb' })
    if (!file || !file.tmpPath) {
      return response.badRequest({ message: 'File CSV/XLSX tidak ditemukan' })
    }

    const filePath = file.tmpPath
    const ext = String(file.extname || '').toLowerCase()

    try {
      let rows: any[] = []

      if (ext === 'xlsx') {
        rows = await readXlsx(filePath)
      } else {
        const reader = new CsvReader()
        const out = await reader.read(filePath)
        rows = out.rows || []
      }

      if (!rows.length) {
        return response.badRequest({ message: 'File kosong / tidak ada data' })
      }

      const skus = Array.from(
        new Set(
          rows
            .map((r: any) =>
              String(
                r?.sku ??
                  r?.variant_sku ??
                  r?.variantsku ??
                  r?.['sku'] ??
                  ''
              ).trim()
            )
            .filter(Boolean)
        )
      )

      if (!skus.length) {
        return response.badRequest({ message: 'SKU tidak ditemukan di file' })
      }

      const variants = await ProductVariant.query()
        .whereIn('sku', skus)
        .select(['id', 'sku', 'price'])

      const bySku = new Map<string, { id: number; price: number }>()
      for (const v of variants) {
        bySku.set(String(v.sku), { id: Number(v.id), price: Number(v.price || 0) || 0 })
      }

      const missing = skus.filter((s) => !bySku.has(s))
      if (missing.length) {
        return response.badRequest({
          message: `SKU tidak ditemukan di database: ${missing.slice(0, 30).join(', ')}${
            missing.length > 30 ? ` (+${missing.length - 30} lainnya)` : ''
          }`,
        })
      }

      const items = rows
        .map((r: any) => {
          const sku = String(
            r?.sku ??
              r?.variant_sku ??
              r?.variantsku ??
              r?.['sku'] ??
              ''
          ).trim()

          if (!sku) return null

          const hargaAkhir =
            toNumOrNull(
              r?.harga_akhir ??
                r?.hargaakhir ??
                r?.final_price ??
                r?.finalprice ??
                r?.['harga akhir'] ??
                r?.['final price']
            )

          const promoStock = toIntOrNull(
            r?.promo_stock ?? r?.promostock ?? r?.['promo stock']
          )

          if (hargaAkhir === null) return null

          const meta = bySku.get(sku)!
          const base = Number(meta.price || 0) || 0

          if (!Number.isFinite(base) || base <= 0) {
            throw new Error(`Base price tidak valid untuk SKU ${sku}`)
          }
          if (hargaAkhir < 0) {
            throw new Error(`Harga akhir tidak boleh negatif (SKU ${sku})`)
          }

          const diff = Math.max(0, base - hargaAkhir)
          let pct = (diff / base) * 100
          if (!Number.isFinite(pct)) pct = 0
          pct = Math.max(0, Math.min(100, pct))
          pct = Math.round(pct * 100) / 100

          const isActive = toIsActiveRaw(r?.is_active ?? r?.active ?? r?.status)
          const finalIsActive = isActive === undefined ? 1 : isActive

          return {
            product_variant_id: 0, // import by SKU
            sku,

            is_active: finalIsActive,
            value_type: 'percent',
            value: pct,

            promo_stock: promoStock,
          }
        })
        .filter(Boolean)

      if (!items.length) {
        return response.badRequest({
          message: 'Tidak ada baris valid untuk di-import (cek SKU & Harga Akhir)',
        })
      }

      const payload = {
        items,
        transfer: request.input('transfer'),
      }

      const result = await this.cms.replaceVariantItemsOnly(params.id, payload)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Import Discount Items ${params.id}`,
        menu: 'Discount',
        data: { id: params.id, ext, count: items.length, transfer: request.input('transfer') },
      })

      return response.ok({
        message: 'Successfully imported.',
        serve: result,
      })
    } catch (error: any) {
      if (error instanceof PromoConflictError) {
        return response.status(409).send({
          message: error.message,
          serve: {
            code: 'PROMO_CONFLICT',
            conflicts: error.conflicts,
            canTransfer: error.canTransfer,
          },
        })
      }

      return response.badRequest({
        message: error?.message || 'Gagal import detail discount',
      })
    } finally {
      cleanupFile(filePath)
    }
  }
}
