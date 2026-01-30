import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddIsBundleToProductVariants extends BaseSchema {
  protected tableName = 'product_variants'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_bundle').notNullable().defaultTo(false)
      table.index(['is_bundle'], 'product_variants_is_bundle_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['is_bundle'], 'product_variants_is_bundle_idx')
      table.dropColumn('is_bundle')
    })
  }
}
