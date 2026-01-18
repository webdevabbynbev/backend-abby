import { parseMoneyRp, pickValue } from '#services/product_csv_import/csv_value_utils'
import type { ImportError, MasterGroup, MasterStats } from '#services/product_csv_import/types'

export default class MasterImporter {
  group(rows: any[], errors: ImportError[]): { groups: Map<string, MasterGroup>; stats: MasterStats } {
    const groups = new Map<string, MasterGroup>()
    const stats: MasterStats = {
      productCreated: 0,
      productUpdated: 0,
      variantCreated: 0,
      mediaCreated: 0,
      tagAttached: 0,
      concernAttached: 0,
      variantAttrAttached: 0,
      onlineCreated: 0,
    }

    rows.forEach((raw, i) => {
      const rowNo = i + 2 // header = line 1

      const brandName = pickValue(raw, ['brand'])
      const productName = pickValue(raw, ['nama produk'])
      const variantName = pickValue(raw, ['nama varian'])
      const masterSku = pickValue(raw, ['sku master'])
      const sku1 = pickValue(raw, ['sku varian 1'])
      const sku2 = pickValue(raw, ['sku varian 2'])

      const parentCat = pickValue(raw, ['parent kategori'])
      const sub1 = pickValue(raw, ['sub_kategori 1', 'sub kategori 1'])
      const sub2 = pickValue(raw, ['sub_kategori 2', 'sub kategori 2'])

      const statusProduk = pickValue(raw, ['status produk'])
      const tags = pickValue(raw, ['tags'])
      const concern = pickValue(raw, ['concern'])
      const subConcern = pickValue(raw, ['sub_concern 1', 'sub concern 1'])

      const stock = Number(pickValue(raw, ['stock'])) || 0
      const basePrice = parseMoneyRp(pickValue(raw, ['base price', 'base_price']))
      const price = parseMoneyRp(pickValue(raw, ['price']))

      const thumbnail = pickValue(raw, ['thumbnail'])
      const photo2 = pickValue(raw, ['photo 2', 'photo2'])
      const photoVariant = pickValue(raw, ['photo variant'])

      if (!productName) {
        errors.push({ row: rowNo, name: '', message: 'Nama Produk kosong' })
        return
      }

      const key = (masterSku || productName).trim()
      if (!key) {
        errors.push({ row: rowNo, name: productName, message: 'SKU Master kosong dan Nama Produk kosong' })
        return
      }

      const existing = groups.get(key)
      const g: MasterGroup =
        existing ||
        ({
          productName,
          masterSku,
          brandName,
          parentCat,
          sub1,
          sub2,
          statusProduk,
          tags,
          concern,
          subConcern,
          photos: [],
          basePrice: basePrice || price || 0,
          variants: [],
        } as MasterGroup)

      if (!g.basePrice && (basePrice || price)) g.basePrice = basePrice || price

      ;[thumbnail, photo2, photoVariant].forEach((p) => {
        if (p && !g.photos!.includes(p)) g.photos!.push(p)
      })

      g.variants!.push({
        variantName: variantName || 'Default',
        sku1,
        sku2,
        stock,
        basePrice,
        price,
        photoVariant,
        __row: rowNo,
      })

      groups.set(key, g)
    })

    return { groups, stats }
  }
}
