import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import ExcelJS from 'exceljs'
import fs from 'fs'
import db from '@adonisjs/lucid/services/db'

import CsvReader from '#services/product_csv_import/csv_reader'
import { DiscountCmsService, PromoConflictError } from '#services/discount/discount_cms_service'
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
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
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

  const vt = String(valueType || '')
    .trim()
    .toLowerCase()
  const v = Number(value || 0) || 0

  let disc = 0
  if (vt === 'fixed') {
    disc = Math.min(Math.max(0, v), base)
  } else if (vt === 'percent') {
    disc = (base * Math.max(0, v)) / 100
    const md =
      maxDiscount === null || maxDiscount === undefined || maxDiscount === ''
        ? null
        : Number(maxDiscount)
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
        ? ((cell.value as any).text ?? (cell.value as any).result ?? String(cell.value))
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
          ? ((cell.value as any).result ?? (cell.value as any).text ?? String(cell.value))
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

  public async templateItems({ response, request, params, auth }: HttpContext) {
    const format = String(request.input('format') || 'excel')
      .trim()
      .toLowerCase()
    const scopeRaw = String(request.input('scope') || 'variant')
      .trim()
      .toLowerCase()
    const scope = scopeRaw === 'product' || scopeRaw === 'brand' ? scopeRaw : 'variant'

    const serve: any = await this.cms.show(params.id)
    const code = String(serve?.code ?? params.id ?? 'discount')
    const safeCode = code.replace(/[^a-zA-Z0-9-_]/g, '_')
    const ts = Date.now()

    const headersVariant = ['sku', 'product', 'variant', 'base_price', 'harga_akhir', 'promo_stock']
    const headersProduct = [
      'product_id',
      'product',
      'value_type',
      'value',
      'promo_stock',
      'purchase_limit',
      'max_discount',
      'note',
    ]
    const headersBrand = [
      'brand_id',
      'brand',
      'value_type',
      'value',
      'promo_stock',
      'purchase_limit',
      'max_discount',
      'note',
    ]

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Download Discount Template (${format.toUpperCase()}) ${safeCode}`,
      menu: 'Discount',
      data: { id: params.id, code, format, scope },
    })

    if (format === 'csv') {
      const headers =
        scope === 'product' ? headersProduct : scope === 'brand' ? headersBrand : headersVariant
      const csv = headers.join(',') + '\n'

      response.header('Content-Type', 'text/csv')
      response.header(
        'Content-Disposition',
        `attachment; filename="discount_template_${safeCode}_${scope}_${ts}.csv"`
      )
      return response.send(csv)
    }

    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Discount Template')
    const headers =
      scope === 'product' ? headersProduct : scope === 'brand' ? headersBrand : headersVariant
    ws.columns = headers.map((h) => ({ header: h.replace(/_/g, ' '), key: h, width: 18 }))

    response.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response.header(
      'Content-Disposition',
      `attachment; filename="discount_template_${safeCode}_${scope}_${ts}.xlsx"`
    )

    const buf: any = await workbook.xlsx.writeBuffer()
    const out = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    return response.send(out)
  }

  public async exportItems({ response, request, params, auth }: HttpContext) {
    const format = String(request.input('format') || 'excel')
      .trim()
      .toLowerCase()
    const scopeRaw = String(request.input('scope') || 'variant')
      .trim()
      .toLowerCase()
    const scope = scopeRaw === 'product' || scopeRaw === 'brand' ? scopeRaw : 'variant'
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

    const headersVariant = ['sku', 'product', 'variant', 'base_price', 'harga_akhir', 'promo_stock']
    const headersProduct = [
      'product_id',
      'product',
      'value_type',
      'value',
      'promo_stock',
      'purchase_limit',
      'max_discount',
      'note',
    ]
    const headersBrand = [
      'brand_id',
      'brand',
      'value_type',
      'value',
      'promo_stock',
      'purchase_limit',
      'max_discount',
      'note',
    ]

    const resolveProductId = (it: any) =>
      Number(
        it?.productId ?? it?.product_id ?? it?.variant?.product_id ?? it?.variant?.productId ?? 0
      ) || 0

    const resolveProductName = (it: any) =>
      String(it?.productName ?? it?.variant?.product?.name ?? it?.product?.name ?? '')

    const buildGroupRows = async () => {
      const productIds = Array.from(
        new Set(
          items.map((it) => resolveProductId(it)).filter((id) => Number.isFinite(id) && id > 0)
        )
      )

      const productRows = productIds.length
        ? await db
            .from('products as p')
            .leftJoin('brands as b', 'b.id', 'p.brand_id')
            .select(
              'p.id as id',
              'p.name as name',
              'p.brand_id as brand_id',
              'b.name as brand_name'
            )
            .whereIn('p.id', productIds)
        : []

      const productMap = new Map<
        number,
        { name: string; brandId: number | null; brandName: string }
      >()
      for (const r of productRows as any[]) {
        const pid = Number(r?.id ?? 0)
        if (!pid) continue
        productMap.set(pid, {
          name: String(r?.name ?? ''),
          brandId: Number(r?.brand_id ?? 0) || null,
          brandName: String(r?.brand_name ?? ''),
        })
      }

      const rows = items.map((it) => {
        const productId = resolveProductId(it)
        const productMeta = productMap.get(productId)
        return {
          productId,
          productName: resolveProductName(it) || productMeta?.name || '',
          brandId: productMeta?.brandId ?? null,
          brandName: productMeta?.brandName ?? '',
          valueType: String(it?.valueType ?? it?.value_type ?? 'percent').toLowerCase(),
          value: Number(it?.value ?? 0),
          promoStock: it?.promoStock ?? it?.promo_stock ?? null,
          purchaseLimit: it?.purchaseLimit ?? it?.purchase_limit ?? null,
          maxDiscount: it?.maxDiscount ?? it?.max_discount ?? null,
        }
      })

      const pickSame = (vals: any[]) => {
        if (!vals.length) return null
        const first = vals[0]
        const same = vals.every((v) => v === first)
        return same ? first : null
      }

      if (scope === 'product') {
        const grouped: Record<string, any[]> = {}
        for (const r of rows) {
          if (!r.productId) continue
          const key = String(r.productId)
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(r)
        }

        return Object.entries(grouped).map(([key, list]) => {
          const valueType = pickSame(list.map((x) => x.valueType))
          const value = pickSame(list.map((x) => x.value))
          const promoStock = pickSame(list.map((x) => x.promoStock))
          const purchaseLimit = pickSame(list.map((x) => x.purchaseLimit))
          const maxDiscount = pickSame(list.map((x) => x.maxDiscount))
          const note = [valueType, value, promoStock, purchaseLimit, maxDiscount].some(
            (v) => v === null
          )
            ? 'VARIED'
            : ''

          return {
            product_id: Number(key),
            product: list[0]?.productName ?? '',
            value_type: valueType ?? '',
            value: value ?? '',
            promo_stock: promoStock ?? '',
            purchase_limit: purchaseLimit ?? '',
            max_discount: maxDiscount ?? '',
            note,
          }
        })
      }

      const grouped: Record<string, any[]> = {}
      for (const r of rows) {
        const key = String(r.brandId ?? 0)
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(r)
      }

      return Object.entries(grouped).map(([key, list]) => {
        const valueType = pickSame(list.map((x) => x.valueType))
        const value = pickSame(list.map((x) => x.value))
        const promoStock = pickSame(list.map((x) => x.promoStock))
        const purchaseLimit = pickSame(list.map((x) => x.purchaseLimit))
        const maxDiscount = pickSame(list.map((x) => x.maxDiscount))
        const note = [valueType, value, promoStock, purchaseLimit, maxDiscount].some(
          (v) => v === null
        )
          ? 'VARIED'
          : ''

        return {
          brand_id: Number(key) || 0,
          brand: list[0]?.brandName ?? '',
          value_type: valueType ?? '',
          value: value ?? '',
          promo_stock: promoStock ?? '',
          purchase_limit: purchaseLimit ?? '',
          max_discount: maxDiscount ?? '',
          note,
        }
      })
    }

    if (format === 'csv') {
      if (scope !== 'variant') {
        const rows = await buildGroupRows()
        const headers = scope === 'product' ? headersProduct : headersBrand
        let csv = headers.join(',') + '\n'
        for (const r of rows) {
          csv += headers.map((h) => csvEscape((r as any)[h] ?? '')).join(',') + '\n'
        }

        response.header('Content-Type', 'text/csv')
        response.header(
          'Content-Disposition',
          `attachment; filename="discount_items_${safeCode}_${scope}_${ts}.csv"`
        )
        return response.send(csv)
      }

      let csv = headersVariant.join(',') + '\n'
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
      response.header(
        'Content-Disposition',
        `attachment; filename="discount_items_${safeCode}_${ts}.csv"`
      )
      return response.send(csv)
    }

    // =======================
    // ✅ EXCEL EXPORT (FIXED)
    // =======================
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Discount Items')

    if (scope !== 'variant') {
      const headers = scope === 'product' ? headersProduct : headersBrand
      ws.columns = headers.map((h) => ({ header: h.replace(/_/g, ' '), key: h, width: 18 }))

      const rows = await buildGroupRows()
      for (const r of rows) ws.addRow(r)

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        `attachment; filename="discount_items_${safeCode}_${scope}_${ts}.xlsx"`
      )

      const buf: any = await workbook.xlsx.writeBuffer()
      const out = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
      return response.send(out)
    }

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

    response.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response.header(
      'Content-Disposition',
      `attachment; filename="discount_items_${safeCode}_${ts}.xlsx"`
    )

    const buf: any = await workbook.xlsx.writeBuffer()
    const out = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    return response.send(out)
  }

  public async importItems({ response, request, params, auth }: HttpContext) {
    const scopeRaw = String(request.input('scope') || 'variant')
      .trim()
      .toLowerCase()
    const scope = scopeRaw === 'product' || scopeRaw === 'brand' ? scopeRaw : 'variant'
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

      if (scope === 'variant') {
        const skus = Array.from(
          new Set(
            rows
              .map((r: any) =>
                String(r?.sku ?? r?.variant_sku ?? r?.variantsku ?? r?.['sku'] ?? '').trim()
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
            const sku = String(r?.sku ?? r?.variant_sku ?? r?.variantsku ?? r?.['sku'] ?? '').trim()

            if (!sku) return null

            const hargaAkhir = toNumOrNull(
              r?.harga_akhir ??
                r?.hargaakhir ??
                r?.final_price ??
                r?.finalprice ??
                r?.['harga akhir'] ??
                r?.['final price']
            )

            const promoStock = toIntOrNull(r?.promo_stock ?? r?.promostock ?? r?.['promo stock'])

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
      }

      const parseValueType = (r: any) => {
        const vt = toValueTypeRaw(r?.value_type ?? r?.valuetype ?? r?.valueType)
        if (vt === 'fixed' || vt === 2) return 'fixed'
        return 'percent'
      }

      const parseValue = (r: any) =>
        toNumOrNull(
          r?.value ?? r?.discount_percent ?? r?.discountpercent ?? r?.percent ?? r?.persen
        )

      const parseFinalPrice = (r: any) =>
        toNumOrNull(
          r?.harga_akhir ?? r?.hargaakhir ?? r?.final_price ?? r?.finalprice ?? r?.['harga akhir']
        )

      const targets = rows
        .map((r: any) => {
          const productId = toIntOrNull(r?.product_id ?? r?.productid ?? r?.productId)
          const brandId = toIntOrNull(r?.brand_id ?? r?.brandid ?? r?.brandId)
          const valueType = parseValueType(r)
          const value = parseValue(r)
          const finalPrice = parseFinalPrice(r)

          const promoStock = toIntOrNull(r?.promo_stock ?? r?.promostock ?? r?.['promo stock'])
          const purchaseLimit = toIntOrNull(
            r?.purchase_limit ?? r?.purchaselimit ?? r?.['purchase limit']
          )
          const maxDiscount = toIntOrNull(r?.max_discount ?? r?.maxdiscount ?? r?.['max discount'])

          if (scope === 'product' && !productId) return null
          if (scope === 'brand' && !brandId) return null
          if (value === null && finalPrice === null) return null

          const isActive = toIsActiveRaw(r?.is_active ?? r?.active ?? r?.status)
          const finalIsActive = isActive === undefined ? 1 : isActive

          return {
            productId,
            brandId,
            valueType,
            value,
            finalPrice,
            promoStock,
            purchaseLimit,
            maxDiscount,
            isActive: finalIsActive,
          }
        })
        .filter(Boolean) as any[]

      if (!targets.length) {
        return response.badRequest({ message: 'Tidak ada baris valid untuk di-import' })
      }

      let productIds: number[] = []
      const productIdsByBrand: Record<number, number[]> = {}

      if (scope === 'product') {
        productIds = Array.from(new Set(targets.map((t) => t.productId)))
      } else {
        const brandIds = Array.from(new Set(targets.map((t) => t.brandId)))
        const products = await db
          .from('products')
          .whereIn('brand_id', brandIds)
          .select(['id', 'brand_id'])

        for (const p of products as any[]) {
          const bid = Number(p?.brand_id ?? 0)
          const pid = Number(p?.id ?? 0)
          if (!bid || !pid) continue
          if (!productIdsByBrand[bid]) productIdsByBrand[bid] = []
          productIdsByBrand[bid].push(pid)
        }

        productIds = Object.values(productIdsByBrand).flat()
      }

      if (!productIds.length) {
        return response.badRequest({ message: 'Produk tidak ditemukan untuk scope tersebut' })
      }

      const variants = await ProductVariant.query()
        .whereIn('product_id', productIds)
        .select(['id', 'product_id', 'price'])

      const variantsByProduct: Record<number, { id: number; price: number }[]> = {}
      for (const v of variants) {
        const pid = Number(v.productId ?? 0) || 0
        if (!pid) continue
        if (!variantsByProduct[pid]) variantsByProduct[pid] = []
        variantsByProduct[pid].push({ id: Number(v.id), price: Number(v.price || 0) || 0 })
      }

      const items: any[] = []
      for (const t of targets) {
        const pids = scope === 'product' ? [t.productId] : (productIdsByBrand[t.brandId] ?? [])
        for (const pid of pids) {
          const list = variantsByProduct[pid] ?? []
          for (const v of list) {
            const base = Number(v.price || 0) || 0
            if (!Number.isFinite(base) || base <= 0) continue

            let valueType = t.valueType
            let value = t.value

            if (t.finalPrice !== null && t.finalPrice !== undefined) {
              const diff = Math.max(0, base - Number(t.finalPrice))
              let pct = (diff / base) * 100
              if (!Number.isFinite(pct)) pct = 0
              pct = Math.max(0, Math.min(100, pct))
              pct = Math.round(pct * 100) / 100
              valueType = 'percent'
              value = pct
            }

            items.push({
              product_variant_id: v.id,
              product_id: pid,
              is_active: t.isActive,
              value_type: valueType,
              value,
              promo_stock: t.promoStock,
              purchase_limit: t.purchaseLimit,
              max_discount: t.maxDiscount,
            })
          }
        }
      }

      if (!items.length) {
        return response.badRequest({ message: 'Tidak ada varian yang cocok untuk di-import' })
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
        activity: `Import Discount Items (${scope}) ${params.id}`,
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