import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sale_variants'

  public async up() {
    const exists = await this.schema.hasTable(this.tableName)
    if (exists) return

    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('sale_id')
        .unsigned()
        .notNullable()
        .references('sales.id')
        .onUpdate('CASCADE')
        .onDelete('CASCADE')

      table
        .integer('product_variant_id')
        .unsigned()
        .notNullable()
        .references('product_variants.id')
        .onUpdate('CASCADE')
        .onDelete('CASCADE')

      table.decimal('sale_price', 12, 2).notNullable()
      table.integer('stock').notNullable().defaultTo(0)

      table.unique(['sale_id', 'product_variant_id'])
      table.index(['product_variant_id'])
      table.index(['sale_id'])

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
