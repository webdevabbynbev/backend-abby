import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateProductVariantBundleItems extends BaseSchema {
  protected tableName = 'product_variant_bundle_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('bundle_variant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('product_variants')
        .onDelete('CASCADE')

      table
        .integer('component_variant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('product_variants')
        .onDelete('RESTRICT')

      table.integer('component_qty').unsigned().notNullable().defaultTo(1)

      table.unique(
        ['bundle_variant_id', 'component_variant_id'],
        'bundle_items_bundle_component_unique'
      )

      table.index(['bundle_variant_id'], 'bundle_items_bundle_variant_idx')
      table.index(['component_variant_id'], 'bundle_items_component_variant_idx')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
