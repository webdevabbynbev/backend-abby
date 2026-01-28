import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export class PromoFlagService {
  private cachedFlashFlagCol: 'is_flash_sale' | 'is_flashsale' | null = null
  private cachedSaleFlagCol: 'is_sale' | null = null

  private nowWibStr() {
    return DateTime.now().setZone('Asia/Jakarta').toFormat('yyyy-LL-dd HH:mm:ss')
  }

  private async resolveFlashFlagColumn(client?: TransactionClientContract | any) {
    if (this.cachedFlashFlagCol) return this.cachedFlashFlagCol

    const schema = (client?.schema ?? (db as any).connection().schema) as any
    if (!schema?.hasColumn) return null

    if (await schema.hasColumn('products', 'is_flash_sale')) {
      this.cachedFlashFlagCol = 'is_flash_sale'
      return this.cachedFlashFlagCol
    }

    if (await schema.hasColumn('products', 'is_flashsale')) {
      this.cachedFlashFlagCol = 'is_flashsale'
      return this.cachedFlashFlagCol
    }

    return null
  }

  private async resolveSaleFlagColumn(client?: TransactionClientContract | any) {
    if (this.cachedSaleFlagCol) return this.cachedSaleFlagCol

    const schema = (client?.schema ?? (db as any).connection().schema) as any
    if (!schema?.hasColumn) return null

    if (await schema.hasColumn('products', 'is_sale')) {
      this.cachedSaleFlagCol = 'is_sale'
      return this.cachedSaleFlagCol
    }

    return null
  }

  async syncFlashSaleFlags(productIds: number[], trx?: TransactionClientContract) {
    const client: any = trx ?? db
    const ids = Array.from(new Set((productIds || []).map((x) => Number(x)).filter(Boolean)))
    if (!ids.length) return

    const flagCol = await this.resolveFlashFlagColumn(client)
    if (!flagCol) return
    
    // Whitelist validation to prevent SQL injection
    if (flagCol !== 'is_flash_sale' && flagCol !== 'is_flashsale') {
      throw new Error('Invalid flag column')
    }

    const nowStr = this.nowWibStr()
    const placeholders = ids.map(() => '?').join(',')

    // 1) reset dulu
    await client.rawQuery(`UPDATE products SET ${flagCol} = false WHERE id IN (${placeholders})`, ids)

    // 2) legacy pivot: flashsale_products (product-level)
    await client.rawQuery(
      `
      UPDATE products
      SET ${flagCol} = true
      WHERE id IN (
        SELECT fsp.product_id
        FROM flashsale_products fsp
        JOIN flash_sales fs
          ON fs.id = fsp.flash_sale_id
        JOIN product_onlines po
          ON po.product_id = fsp.product_id
         AND po.is_active = true
        WHERE fs.is_publish = true
          AND fs.end_datetime >= ?
      )
        AND id IN (${placeholders})
      `,
      [nowStr, ...ids]
    )

    // 3) NEW pivot: flashsale_variants (variant-level)
    await client.rawQuery(
      `
      UPDATE products
      SET ${flagCol} = true
      WHERE id IN (
        SELECT pv.product_id
        FROM flashsale_variants fsv
        JOIN product_variants pv
          ON pv.id = fsv.product_variant_id
         AND pv.deleted_at IS NULL
        JOIN flash_sales fs
          ON fs.id = fsv.flash_sale_id
        JOIN product_onlines po
          ON po.product_id = pv.product_id
         AND po.is_active = true
        WHERE fs.is_publish = true
          AND fs.end_datetime >= ?
      )
        AND id IN (${placeholders})
      `,
      [nowStr, ...ids]
    )
  }

  async syncSaleFlags(productIds: number[], trx?: TransactionClientContract) {
    const client: any = trx ?? db
    const ids = Array.from(new Set((productIds || []).map((x) => Number(x)).filter(Boolean)))
    if (!ids.length) return

    const flagCol = await this.resolveSaleFlagColumn(client)
    if (!flagCol) return
    
    // Whitelist validation to prevent SQL injection
    if (flagCol !== 'is_sale') {
      throw new Error('Invalid flag column')
    }

    const nowStr = this.nowWibStr()
    const placeholders = ids.map(() => '?').join(',')

    // 1) reset dulu
    await client.rawQuery(`UPDATE products SET ${flagCol} = false WHERE id IN (${placeholders})`, ids)

    // 2) legacy pivot: sale_products (product-level)
    await client.rawQuery(
      `
      UPDATE products
      SET ${flagCol} = true
      WHERE id IN (
        SELECT sp.product_id
        FROM sale_products sp
        JOIN sales s
          ON s.id = sp.sale_id
        JOIN product_onlines po
          ON po.product_id = sp.product_id
         AND po.is_active = true
        WHERE s.is_publish = true
          AND s.end_datetime >= ?
      )
        AND id IN (${placeholders})
      `,
      [nowStr, ...ids]
    )

    // 3) NEW pivot: sale_variants (variant-level)
    await client.rawQuery(
      `
      UPDATE products
      SET ${flagCol} = true
      WHERE id IN (
        SELECT pv.product_id
        FROM sale_variants sv
        JOIN product_variants pv
          ON pv.id = sv.product_variant_id
         AND pv.deleted_at IS NULL
        JOIN sales s
          ON s.id = sv.sale_id
        JOIN product_onlines po
          ON po.product_id = pv.product_id
         AND po.is_active = true
        WHERE s.is_publish = true
          AND s.end_datetime >= ?
      )
        AND id IN (${placeholders})
      `,
      [nowStr, ...ids]
    )
  }
}