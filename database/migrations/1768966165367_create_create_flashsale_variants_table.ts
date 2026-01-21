import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'flashsale_variants'

  public async up() {
    const exists = await this.schema.hasTable(this.tableName)
    if (exists) return

    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('flash_sale_id')
        .unsigned()
        .notNullable()
        .references('flash_sales.id')
        .onUpdate('CASCADE')
        .onDelete('CASCADE')

      table
        .integer('product_variant_id')
        .unsigned()
        .notNullable()
        .references('product_variants.id')
        .onUpdate('CASCADE')
        .onDelete('CASCADE')

      table.decimal('flash_price', 12, 2).notNullable()
      table.integer('stock').notNullable().defaultTo(0)

      table.unique(['flash_sale_id', 'product_variant_id'])
      table.index(['product_variant_id'])
      table.index(['flash_sale_id'])

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  public async down() {
    const exists = await this.schema.hasTable(this.tableName)
    if (!exists) return

    this.schema.dropTable(this.tableName)
  }
}
