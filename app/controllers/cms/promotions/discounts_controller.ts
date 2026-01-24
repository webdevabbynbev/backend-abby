import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import ExcelJS from 'exceljs'
import fs from 'fs'

import CsvReader from '#services/product_csv_import/csv_reader'
import {
  DiscountCmsService,
  PromoConflictError,
} from '#services/discount/discount_cms_service'

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

async function readXlsx(filePath: string): Promise<any[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const ws = wb.worksheets[0]
  if (!ws) return []

  const headerRow = ws.getRow(1)
  const headers: string[] = []
  headerRow.eachCell((cell, col) => {
    headers[col - 1] = normHeader(cell.value)
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
      // ExcelJS cell.value bisa object (rich text) → stringify aman
      const val: any =
        typeof cell.value === 'object' && cell.value !== null
          ? (cell.value as any).text ?? String(cell.value)
          : cell.value
      obj[key] = val
    }

    // skip empty row
    const hasAny = Object.values(obj).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
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

  /**
   * ✅ Export detail items discount (CSV / Excel)
   * query:
   * - format=csv | excel (default excel)
   */
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

    const headers = [
      'sku',
      'product',
      'variant',
      'base_price',
      'stock',
      'is_active',
      'value_type',
      'value',
      'max_discount',
      'promo_stock',
      'purchase_limit',
      'product_variant_id',
    ]

    if (format === 'csv') {
      let csv = headers.join(',') + '\n'
      for (const it of items) {
        csv +=
          [
            csvEscape(it?.sku ?? it?.variant?.sku ?? ''),
            csvEscape(it?.productName ?? it?.variant?.product?.name ?? ''),
            csvEscape(it?.variantLabel ?? it?.variant?.label ?? ''),
            csvEscape(it?.price ?? it?.variant?.price ?? ''),
            csvEscape(it?.stock ?? it?.variant?.stock ?? ''),
            csvEscape(it?.isActive ? 1 : 0),
            csvEscape(it?.valueType ?? ''),
            csvEscape(it?.value ?? ''),
            csvEscape(it?.maxDiscount ?? ''),
            csvEscape(it?.promoStock ?? ''),
            csvEscape(it?.purchaseLimit ?? ''),
            csvEscape(it?.productVariantId ?? it?.product_variant_id ?? ''),
          ].join(',') + '\n'
      }

      response.header('Content-Type', 'text/csv')
      response.header('Content-Disposition', `attachment; filename="discount_items_${safeCode}_${ts}.csv"`)
      return response.send(csv)
    }

    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Discount Items')

    ws.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Variant', key: 'variant', width: 30 },
      { header: 'Base Price', key: 'base_price', width: 15 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Active (0/1)', key: 'is_active', width: 14 },
      { header: 'Value Type', key: 'value_type', width: 12 },
      { header: 'Value', key: 'value', width: 12 },
      { header: 'Max Discount', key: 'max_discount', width: 15 },
      { header: 'Promo Stock', key: 'promo_stock', width: 12 },
      { header: 'Purchase Limit', key: 'purchase_limit', width: 15 },
      { header: 'Product Variant ID', key: 'product_variant_id', width: 18 },
    ]

    for (const it of items) {
      ws.addRow({
        sku: it?.sku ?? it?.variant?.sku ?? '',
        product: it?.productName ?? it?.variant?.product?.name ?? '',
        variant: it?.variantLabel ?? it?.variant?.label ?? '',
        base_price: it?.price ?? it?.variant?.price ?? '',
        stock: it?.stock ?? it?.variant?.stock ?? '',
        is_active: it?.isActive ? 1 : 0,
        value_type: it?.valueType ?? '',
        value: it?.value ?? '',
        max_discount: it?.maxDiscount ?? '',
        promo_stock: it?.promoStock ?? '',
        purchase_limit: it?.purchaseLimit ?? '',
        product_variant_id: it?.productVariantId ?? it?.product_variant_id ?? '',
      })
    }

    response.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response.header(
      'Content-Disposition',
      `attachment; filename="discount_items_${safeCode}_${ts}.xlsx"`
    )
    await workbook.xlsx.write(response.response)
    return response.response
  }

  /**
   * ✅ Import detail items discount (CSV / Excel)
   * multipart:
   * - file: .csv atau .xlsx
   * body optional:
   * - transfer: 1|true (buat auto transfer conflict promo)
   */
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

      // map rows -> items payload (biar langsung kompatibel dengan service.normalizeVariantItems)
      const items = rows.map((r: any) => {
        const pvId =
          Number(r?.product_variant_id ?? r?.productvariantid ?? r?.variant_id ?? r?.id ?? 0) || 0

        const sku =
          String(
            r?.sku ??
              r?.variant_sku ??
              r?.variantsku ??
              r?.variant ??
              ''
          )
            .trim() || null

        return {
          product_variant_id: pvId,
          sku,

          is_active: toIsActiveRaw(r?.is_active ?? r?.active ?? r?.status),
          value_type: toValueTypeRaw(r?.value_type ?? r?.valuetype),
          value: toNumOrNull(r?.value) ?? 0,

          max_discount: toNumOrNull(r?.max_discount),
          promo_stock: toIntOrNull(r?.promo_stock),
          purchase_limit: toIntOrNull(r?.purchase_limit),
        }
      })

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