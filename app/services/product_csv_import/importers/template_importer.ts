import { DateTime } from 'luxon'
import Product from '#models/product'
import ProductOnline from '#models/product_online'

import { validateProductCsvRow } from '#validators/product_csv.validator'
import { slugify } from '#services/product_csv_import/csv_value_utils'
import type { ImportError } from '#services/product_csv_import/types'

export default class TemplateImporter {
  validate(rows: any[], errors: ImportError[]): { validRows: any[] } {
    const validRows: any[] = []

    rows.forEach((row, index) => {
      try {
        validateProductCsvRow(row)
        validRows.push({ ...row, __row: index + 1 })
      } catch (err: any) {
        errors.push({ row: index + 1, name: row?.name, message: err.message })
      }
    })

    return { validRows }
  }

  async process(validRows: any[], trx: any): Promise<void> {
    for (const row of validRows) {
      const product = await Product.create(
        {
          name: row.name,
          slug: row.slug ? row.slug : slugify(row.name),
          masterSku: row.master_sku || null,
          description: row.description || null,
          basePrice: Number(row.base_price) || 0,
          weight: Number(row.weight) || 0,
          isFlashSale: String(row.is_flash_sale) === '1',
          status: row.status || 'normal',
          categoryTypeId: Number(row.category_type_id),
          brandId: row.brand_id ? Number(row.brand_id) : undefined,
          personaId: row.persona_id ? Number(row.persona_id) : undefined,
        } as any,
        { client: trx }
      )

      const online = await ProductOnline.query({ client: trx }).where('product_id', product.id).first()
      if (!online) {
        await ProductOnline.create(
          { productId: product.id, isActive: true, publishedAt: DateTime.now() as any } as any,
          { client: trx }
        )
      }
    }
  }
}
