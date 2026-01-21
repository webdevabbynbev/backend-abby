import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'discount_variant_items'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')

      // FK ke discounts
      table
        .bigInteger('discount_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('discounts')
        .onDelete('CASCADE')

      // Optional tapi berguna buat query/listing
      table
        .bigInteger('product_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('products')
        .onDelete('SET NULL')

      // KUNCI: varian spesifik (SKU/combination)
      table
        .bigInteger('product_variant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('product_variants')
        .onDelete('CASCADE')

      // Toggle aktif per varian (kayak Shopee)
      table.boolean('is_active').notNullable().defaultTo(true)

      // Diskon per varian
      // percent = 10 (artinya 10%)
      // fixed = 5000 (artinya Rp5000)
      table.enum('value_type', ['percent', 'fixed']).notNullable()
      table.decimal('value', 12, 2).notNullable().defaultTo(0)

      // opsional: max diskon (buat percent)
      table.decimal('max_discount', 12, 2).nullable()

      // opsional: stok promo & limit beli per varian
      table.integer('promo_stock').unsigned().nullable()
      table.integer('purchase_limit').unsigned().nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // 1 discount tidak boleh punya 2 row untuk varian yang sama
      table.unique(['discount_id', 'product_variant_id'])

      // bantu performa query
      table.index(['discount_id'])
      table.index(['product_variant_id'])
      table.index(['product_id'])
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
