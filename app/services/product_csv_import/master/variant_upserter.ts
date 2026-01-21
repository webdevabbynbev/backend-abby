import ProductVariant from '#models/product_variant'
import ProductMedia from '#models/product_media'
import type { ImportError } from '#services/product_csv_import/types'

export default class VariantUpserter {
  async upsertFromGroup(
    productId: number,
    productName: string,
    variants: any[] = [],
    trx: any,
    errors: ImportError[]
  ): Promise<{
    items: Array<{ variant: any; variantName: string }>
    variantCreated: number
    mediaCreated: number
  }> {
    // dedupe by barcode (SKU Varian 2) => last row wins
    const byBarcode = new Map<string, any>()
    for (const v of variants || []) {
      const b = String(v?.sku2 || '').trim()
      if (!b) {
        errors.push({ row: v?.__row ?? '-', name: productName, message: 'SKU Varian 2 (barcode) kosong' })
        continue
      }
      byBarcode.set(b, v)
    }

    const barcodes = Array.from(byBarcode.keys())
    if (!barcodes.length) return { items: [], variantCreated: 0, mediaCreated: 0 }

    // 1) batch load existing variants by barcode
    const existingByBarcodeRows = await ProductVariant.query({ client: trx }).whereIn('barcode', barcodes)
    const existingByBarcode = new Map<string, any>()
    for (const row of existingByBarcodeRows) existingByBarcode.set(String((row as any).barcode), row)

    // 2) prepare fallback sku list for those missing barcode
    const missing = barcodes.filter((b) => !existingByBarcode.has(b))
    const skusToCheck: string[] = []
    for (const b of missing) {
      const v = byBarcode.get(b)
      const sku = String(v?.sku1 || '').trim() || b
      if (sku) skusToCheck.push(sku)
    }
    const uniqSkusToCheck = Array.from(new Set(skusToCheck))

    const existingBySku = new Map<string, any>()
    if (uniqSkusToCheck.length) {
      const rows = await ProductVariant.query({ client: trx }).whereIn('sku', uniqSkusToCheck)
      for (const r of rows) existingBySku.set(String((r as any).sku), r)
    }

    let variantCreated = 0
    let mediaCreated = 0
    const items: Array<{ variant: any; variantName: string }> = []

    // collect variant photo urls for batch media insert (pv -> alt)
    const pvAltMap = new Map<string, string>()

    for (const barcode of barcodes) {
      const v = byBarcode.get(barcode)

      const sku = String(v?.sku1 || '').trim() || barcode
      const stock = Number(v?.stock) || 0
      const priceNum = Number(v?.price || v?.basePrice || 0)
      const price = String(priceNum)
      const variantName = String(v?.variantName || '').trim() || 'Default'

      let variant = existingByBarcode.get(barcode)
      if (!variant && sku) variant = existingBySku.get(sku)

      if (variant) {
        // behavior existing: re-assign kalau pernah dipakai product lain
        variant.productId = productId
        variant.sku = sku
        variant.barcode = barcode
        variant.price = price
        variant.stock = stock
        await variant.save()
      } else {
        variant = await ProductVariant.create({ productId, sku, barcode, price, stock } as any, { client: trx })
        variantCreated += 1
      }

      const pv = String(v?.photoVariant || '').trim()
      if (pv) {
        // satu alt per url (ambil first)
        if (!pvAltMap.has(pv)) pvAltMap.set(pv, `${productName} - ${variantName}`)
      }

      items.push({ variant, variantName })
    }

    // 3) batch insert variant photo media (optional)
    const pvUrls = Array.from(pvAltMap.keys())
    if (pvUrls.length) {
      const existingMedia = await ProductMedia.query({ client: trx })
        .where('product_id', productId)
        .whereIn('url', pvUrls)
        .select(['url'])

      const existSet = new Set(existingMedia.map((m: any) => String(m.url)))
      const toInsert = pvUrls.filter((u) => !existSet.has(u))

      if (toInsert.length) {
        await ProductMedia.createMany(
          toInsert.map((u) => ({
            productId,
            url: u,
            altText: pvAltMap.get(u) || productName,
            type: 1 as any,
          })) as any,
          { client: trx }
        )
        mediaCreated += toInsert.length
      }
    }

    return { items, variantCreated, mediaCreated }
  }
}
