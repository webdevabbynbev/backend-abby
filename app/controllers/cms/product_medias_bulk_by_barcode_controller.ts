import type { HttpContext } from '@adonisjs/core/http'
import path from 'path'

import ProductVariant from '#models/product_variant'
import ProductMedia from '#models/product_media'
import FileUploadService from '#utils/upload_file_service'
import { SecurityUtils } from '#utils/security'

type ParsedName = { code: string; slot: number; slotExplicit: boolean; ext: string }

function parseCodeSlot(filename: string): ParsedName | null {
  const base = path.basename(String(filename || '')).trim()
  if (!base) return null

  // ext
  const mExt = base.match(/\.(png|jpe?g|webp)$/i)
  if (!mExt) return null
  const ext = mExt[1].toLowerCase()

  // stem (without extension)
  let stem = base.slice(0, -mExt[0].length).trim()

  // strip Windows " (2)" copy suffix
  stem = stem.replace(/\s*\(\d+\)\s*$/, '').trim()
  if (!stem) return null

  // slot suffix: -1 / _2 / .3
  let slot = 1
  let slotExplicit = false
  let code = stem

  const mSlot = stem.match(/^(.*?)(?:[-_.]([1-4]))$/)
  if (mSlot) {
    code = mSlot[1].trim()
    slot = Number(mSlot[2])
    slotExplicit = true
  }

  if (!code) return null

  // allow SKU/barcode style: alnum + . _ -
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(code)) return null

  if (!Number.isFinite(slot) || slot < 1 || slot > 4) return null
  return { code, slot, slotExplicit, ext }
}

export default class ProductMediasBulkByBarcodeController {
  public async handle({ request, response }: HttpContext) {
    try {
      const mode = String(request.input('mode') || 'replace').toLowerCase() as 'replace' | 'skip'
      const type = SecurityUtils.safeNumber(request.input('type'), 1)

      // override slot: hanya dipakai kalau filename tidak explicit slot
      const overrideSlotRaw = request.input('slot')
      const overrideSlot =
        overrideSlotRaw !== undefined && overrideSlotRaw !== null
          ? SecurityUtils.safeNumber(overrideSlotRaw, 1)
          : null

      if (overrideSlot !== null && (overrideSlot < 1 || overrideSlot > 4)) {
        return response.badRequest({ message: 'slot harus 1-4', serve: null })
      }

      const productIdFilterRaw = request.input('product_id')
      const productIdFilter = productIdFilterRaw ? SecurityUtils.safeNumber(productIdFilterRaw, 0) : null

      const files = (request as any).files('files', {
        size: '10mb',
        extnames: ['jpg', 'jpeg', 'png', 'webp'],
      }) as any[]

      if (!files || files.length === 0) {
        return response.badRequest({ message: 'files wajib diisi', serve: null })
      }

      for (const f of files) {
        if (!f) continue
        if (f.isValid === false) {
          return response.badRequest({ message: 'Ada file yang tidak valid', serve: f.errors })
        }
      }

      const items: Array<{
        file: any
        filename: string
        code: string
        slot: number
      }> = []

      const errors: Array<{ file: string; reason: string }> = []

      for (const f of files) {
        const filename = String(f?.clientName || '').trim()
        const parsed = parseCodeSlot(filename)

        if (!parsed) {
          errors.push({ file: filename || '(unknown)', reason: 'invalid_filename_format' })
          continue
        }

        // slot final: kalau filename explicit slot → pakai itu
        // kalau tidak explicit → pakai overrideSlot (kalau ada) → fallback ke 1
        const slotFinal = !parsed.slotExplicit && overrideSlot !== null ? overrideSlot : parsed.slot

        if (slotFinal < 1 || slotFinal > 4) {
          errors.push({ file: filename || '(unknown)', reason: 'slot_out_of_range' })
          continue
        }

        items.push({ file: f, filename, code: parsed.code, slot: slotFinal })
      }

      if (items.length === 0) {
        return response.badRequest({
          message: 'Tidak ada file valid untuk diproses',
          serve: { total: files.length, success: 0, failed: errors.length, errors },
        })
      }

      // Lookup variant by sku OR barcode
      const uniqueCodes = Array.from(new Set(items.map((x) => x.code)))

      const variantQuery = ProductVariant.query()
        .select(['id', 'barcode', 'sku', 'product_id'])
        .whereNull('deleted_at')
        .where((q) => {
          q.whereIn('barcode', uniqueCodes).orWhereIn('sku', uniqueCodes)
        })

      if (productIdFilter) variantQuery.where('product_id', productIdFilter)

      const variants = await variantQuery

      const codeMap = new Map<string, { variantId: number; productId: number }>()
      for (const v of variants) {
        const barcode = String((v as any).barcode || '').trim()
        const sku = String((v as any).sku || '').trim()
        const productId = Number((v as any).productId ?? (v as any).product_id)
        const entry = { variantId: Number(v.id), productId }

        if (barcode) codeMap.set(barcode, entry)
        if (sku) codeMap.set(sku, entry)
      }

      let success = 0
      const seen = new Set<string>()

      for (const it of items) {
        const key = `${it.code}#${it.slot}`
        if (seen.has(key)) {
          // duplikat dalam batch (misal ada file copy "(2)")
          // kita skip aja biar tidak overwrite bolak-balik
          errors.push({ file: it.filename, reason: 'duplicate_code_slot_in_batch' })
          continue
        }
        seen.add(key)

        const mapped = codeMap.get(it.code)
        if (!mapped || !mapped.variantId || !mapped.productId) {
          errors.push({ file: it.filename, reason: 'code_not_found' })
          continue
        }

        const { variantId, productId } = mapped
        const slotStr = String(it.slot)

        // publicId konsisten: slot 1 => code, slot 2..4 => code-2..4
        const publicId = it.slot === 1 ? it.code : `${it.code}-${it.slot}`
        const folder = `Products/${productId}/variant-${variantId}`

        if (mode === 'skip') {
          const exists = await ProductMedia.query()
            .where('variant_id', variantId)
            .where('type', type)
            .where('slot', slotStr)
            .whereNull('deleted_at')
            .first()

          if (exists) {
            errors.push({ file: it.filename, reason: 'slot_already_exists_skip' })
            continue
          }
        }

        if (mode === 'replace') {
          await ProductMedia.query()
            .where('variant_id', variantId)
            .where('type', type)
            .where('slot', slotStr)
            .delete()
        }

        const url = await (FileUploadService as any).uploadFile(it.file, { folder }, { publicId })

        await ProductMedia.create({
          productId,
          variantId,
          url,
          altText: '',
          type,
          slot: slotStr,
        })

        success++
      }

      return response.status(200).send({
        message: 'success',
        serve: {
          total: files.length,
          processed: items.length,
          success,
          failed: errors.length,
          errors,
        },
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: null,
      })
    }
  }
}
