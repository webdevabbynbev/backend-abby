import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateSaleProductsTable extends BaseSchema {
  protected tableName = 'sale_products'

  async up() {
    const exists = await this.schema.hasTable(this.tableName)
    if (exists) return

    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('sale_id')
      table.integer('product_id')
      table.decimal('sale_price', 12, 2).notNullable()
      table.integer('stock').defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    const exists = await this.schema.hasTable(this.tableName)
    if (!exists) return

    this.schema.dropTable(this.tableName)
  }
}
