import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddUniqueWishlistsUserProductsTable extends BaseSchema {
  protected tableName = 'wishlists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['user_id', 'product_id'], 'wishlists_user_id_product_id_unique')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['user_id', 'product_id'], 'wishlists_user_id_product_id_unique')
    })
  }
}
