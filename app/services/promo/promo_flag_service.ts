import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export class PromoFlagService {
  private nowWibStr() {
    return DateTime.now().setZone('Asia/Jakarta').toFormat('yyyy-LL-dd HH:mm:ss')
  }

  async syncFlashSaleFlags(productIds: number[], trx?: TransactionClientContract) {
    const client: any = trx ?? db
    const ids = Array.from(new Set((productIds || []).map((x) => Number(x)).filter(Boolean)))
    if (!ids.length) return

    const nowStr = this.nowWibStr()
    const placeholders = ids.map(() => '?').join(',')

    // 1) reset dulu
    await client.rawQuery(`UPDATE products SET is_flash_sale = 0 WHERE id IN (${placeholders})`, ids)

    // 2) legacy pivot: flashsale_products (product-level)
    await client.rawQuery(
      `
      UPDATE products p
      JOIN product_onlines po
        ON po.product_id = p.id
       AND po.is_active = 1
      JOIN flashsale_products fsp
        ON fsp.product_id = p.id
      JOIN flash_sales fs
        ON fs.id = fsp.flash_sale_id
       AND fs.is_publish = 1
       AND fs.end_datetime >= ?
      SET p.is_flash_sale = 1
      WHERE p.id IN (${placeholders})
      `,
      [nowStr, ...ids]
    )

    // 3) NEW pivot: flashsale_variants (variant-level)
    await client.rawQuery(
      `
      UPDATE products p
      JOIN product_onlines po
        ON po.product_id = p.id
       AND po.is_active = 1
      JOIN product_variants pv
        ON pv.product_id = p.id
       AND pv.deleted_at IS NULL
      JOIN flashsale_variants fsv
        ON fsv.product_variant_id = pv.id
      JOIN flash_sales fs
        ON fs.id = fsv.flash_sale_id
       AND fs.is_publish = 1
       AND fs.end_datetime >= ?
      SET p.is_flash_sale = 1
      WHERE p.id IN (${placeholders})
      `,
      [nowStr, ...ids]
    )
  }
}
