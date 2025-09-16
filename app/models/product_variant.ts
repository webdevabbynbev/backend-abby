import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, manyToMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Product from './product.js'
import AttributeValue from './attribute_value.js'
import StockMovement from './stock_movement.js'

export default class ProductVariant extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sku: string

  @column()
  declare barcode: string

  @column()
  declare price: string

  @column()
  declare stock: number

  @column()
  declare productId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @manyToMany(() => AttributeValue, {
    pivotTable: 'variant_attributes',
  })
  declare attributes: ManyToMany<typeof AttributeValue>

  public static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })

  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  public async restore() {
    this.deletedAt = null
    await this.save()
  }

  public static async generateSku(masterSku: string, barcode: string) {
    let baseSku = `${masterSku}-${barcode}`
    let existing = await ProductVariant.query().where('sku', baseSku).first()
    let counter = 1
    let sku = baseSku

    while (existing) {
      counter++
      sku = `${baseSku}-${counter}`
      existing = await ProductVariant.query().where('sku', sku).first()
    }

    return sku
  }

  /**
   * Audit & update stok
   * @param change positif (+) = tambah stok, negatif (-) = kurangi stok
   */
  public async adjustStock(
    change: number,
    type: string,
    relatedId?: number,
    note?: string,
    trx?: TransactionClientContract
  ) {
    if (trx) {
      this.useTransaction(trx)
    }

    this.stock = this.stock + change
    await this.save()

    if (trx) {
      await StockMovement.create(
        {
          productVariantId: this.id,
          change,
          type,
          relatedId: relatedId || null,
          note: note || null,
        },
        { client: trx }
      )
    } else {
      await StockMovement.create({
        productVariantId: this.id,
        change,
        type,
        relatedId: relatedId || null,
        note: note || null,
      })
    }
  }
}
