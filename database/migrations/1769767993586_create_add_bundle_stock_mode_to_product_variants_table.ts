import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddBundleStockModeToProductVariants extends BaseSchema {
  protected tableName = 'product_variants'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // KIT = stok bundle berdiri sendiri (kitting)
      // VIRTUAL = stok bundle dihitung dari stok komponen
      table.string('bundle_stock_mode', 10).notNullable().defaultTo('KIT')
      table.index(['bundle_stock_mode'], 'product_variants_bundle_stock_mode_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['bundle_stock_mode'], 'product_variants_bundle_stock_mode_idx')
      table.dropColumn('bundle_stock_mode')
    })
  }
}
