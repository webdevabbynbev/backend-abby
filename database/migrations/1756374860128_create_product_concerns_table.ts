import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateProductConcerns extends BaseSchema {
  protected tableName = 'product_concerns'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('product_id')
        .unsigned()
        .references('products.id')
        .onDelete('cascade')
        .onUpdate('cascade')

      table
        .integer('concern_id')
        .unsigned()
        .references('concerns.id')
        .onDelete('cascade')
        .onUpdate('cascade')

      table.unique(['product_id', 'concern_id'])
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
