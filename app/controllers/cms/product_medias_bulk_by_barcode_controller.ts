import type { HttpContext } from '@adonisjs/core/http'
import path from 'path'

import ProductVariant from '#models/product_variant'
import ProductMedia from '#models/product_media'
import FileUploadService from '#utils/upload_file_service'
import { SecurityUtils } from '#utils/security'

type ParsedName = { barcode: string; slot: number; ext: string }

function parseBarcodeSlot(filename: string): ParsedName | null {
  // Aman kalau clientName kebawa path (folder upload)
  const base = path.basename(filename).trim()

  // BARCODE.png        => slot 1
  // BARCODE-2.png      => slot 2
  // BARCODE-3.png      => slot 3
  // BARCODE-4.png      => slot 4
  const re = /^(\d+)(?:-(\d+))?\.(png|jpe?g|webp)$/i
  const m = base.match(re)
  if (!m) return null

  const barcode = m[1]
  const slot = m[2] ? Number(m[2]) : 1
  const ext = m[3].toLowerCase()

  if (!Number.isFinite(slot) || slot < 1 || slot > 4) return null
  return { barcode, slot, ext }
}

export default class ProductMediasBulkByBarcodeController {
  public async handle({ request, response }: HttpContext) {
    try {
      const mode = String(request.input('mode') || 'replace').toLowerCase() as 'replace' | 'skip'
      const type = SecurityUtils.safeNumber(request.input('type'), 1)

      // OPTIONAL: override slot dari CMS (kalau file tidak ada -2/-3/-4)
      const overrideSlotRaw = request.input('slot')
      const overrideSlot = overrideSlotRaw !== undefined && overrideSlotRaw !== null
        ? SecurityUtils.safeNumber(overrideSlotRaw, 1)
        : null

      if (overrideSlot !== null && (overrideSlot < 1 || overrideSlot > 4)) {
        return response.badRequest({ message: 'slot harus 1-4', serve: null })
      }

      // OPTIONAL: kalau mau lebih ketat berdasarkan produk (bisa dipakai nanti)
      const productIdFilterRaw = request.input('product_id')
      const productIdFilter = productIdFilterRaw ? SecurityUtils.safeNumber(productIdFilterRaw, 0) : null

      const files = (request as any).files('files', {
        size: '10mb',
        extnames: ['jpg', 'jpeg', 'png', 'webp'],
      }) as any[]

      if (!files || files.length === 0) {
        return response.badRequest({ message: 'files wajib diisi', serve: null })
      }

      // Validasi file basic dari Adonis
      for (const f of files) {
        if (!f) continue
        if (f.isValid === false) {
          return response.badRequest({ message: 'Ada file yang tidak valid', serve: f.errors })
        }
      }

      // 1) Parse semua filename → kumpulkan barcode & slot
      const items: Array<{
        file: any
        filename: string
        barcode: string
        slot: number
      }> = []

      const errors: Array<{ file: string; reason: string }> = []

      for (const f of files) {
        const filename = String(f?.clientName || '').trim()
        const parsed = parseBarcodeSlot(filename)

        if (!parsed) {
          errors.push({ file: filename || '(unknown)', reason: 'invalid_filename_format' })
          continue
        }

        // slot final: overrideSlot kalau ada, else slot dari nama (barcode-2), else default 1
        const slotFinal = overrideSlot ?? parsed.slot

        if (slotFinal < 1 || slotFinal > 4) {
          errors.push({ file: filename || '(unknown)', reason: 'slot_out_of_range' })
          continue
        }

        items.push({ file: f, filename, barcode: parsed.barcode, slot: slotFinal })
      }

      if (items.length === 0) {
        return response.badRequest({
          message: 'Tidak ada file valid untuk diproses',
          serve: { total: files.length, success: 0, failed: errors.length, errors },
        })
      }

      // 2) Batch lookup barcode → variant_id + product_id (sekali query)
      const uniqueBarcodes = Array.from(new Set(items.map((x) => x.barcode)))

      const variantQuery = ProductVariant.query()
        .select(['id', 'barcode', 'product_id'])
        .whereIn('barcode', uniqueBarcodes)
        .whereNull('deleted_at')

      if (productIdFilter) {
        variantQuery.where('product_id', productIdFilter)
      }

      const variants = await variantQuery

      const variantMap = new Map<string, { variantId: number; productId: number }>()
      for (const v of variants) {
        const barcode = String((v as any).barcode || '').trim()
        const productId = Number((v as any).productId ?? (v as any).product_id)
        variantMap.set(barcode, { variantId: Number(v.id), productId })
      }

      // 3) Proses upload + insert media
      let success = 0

      // Cegah duplikat dalam batch (misalnya file yang sama keupload 2x)
      const seen = new Set<string>()

      for (const it of items) {
        const key = `${it.barcode}#${it.slot}`
        if (seen.has(key)) {
          errors.push({ file: it.filename, reason: 'duplicate_barcode_slot_in_batch' })
          continue
        }
        seen.add(key)

        const mapped = variantMap.get(it.barcode)
        if (!mapped || !mapped.variantId || !mapped.productId) {
          errors.push({ file: it.filename, reason: 'barcode_not_found' })
          continue
        }

        const { variantId, productId } = mapped
        const slotStr = String(it.slot)

        // publicId: slot 1 => barcode, slot 2..4 => barcode-2..4
        const publicId = it.slot === 1 ? it.barcode : `${it.barcode}-${it.slot}`

        // Konsisten dengan URL yang sudah kamu pakai (Products huruf besar)
        const folder = `Products/${productId}/variant-${variantId}`

        // mode=skip: kalau slot sudah ada, skip
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

        // mode=replace: HARD DELETE biar gak dobel (dan gak kebaca lagi di preload)
        if (mode === 'replace') {
          await ProductMedia.query()
            .where('variant_id', variantId)
            .where('type', type)
            .where('slot', slotStr)
            .delete()
        }

        // Upload ke S3 + store link ke Supabase (lewat FileUploadService yang sudah ada)
        const url = await (FileUploadService as any).uploadFile(it.file, { folder }, { publicId })

        // Simpan relasi ke DB utama (ini yang bikin “MATCH” ke variant)
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
