import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateProductVariantStocksTable extends BaseSchema {
  protected tableName = 'product_variant_stocks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      table
        .integer('product_variant_id')
        .unsigned()
        .references('id')
        .inTable('product_variants')
        .onDelete('CASCADE')

      // Channels: website, offline_store, marketplace_tokopedia, marketplace_shopee, etc
      table.string('channel', 50).notNullable()
      
      table.integer('stock').defaultTo(0)
      table.integer('reserved_stock').defaultTo(0) // untuk pending transactions
      
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())

      // Unique constraint: satu variant hanya bisa punya 1 record per channel
      table.unique(['product_variant_id', 'channel'])
      
      table.index(['channel'])
      table.index(['product_variant_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}