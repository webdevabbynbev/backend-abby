import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'transaction_shipments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('pic')
      table.string('pic_phone')
      table.string('postal_code', 30).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('pic')
      table.dropColumn('pic_phone')
      table.dropColumn('postal_code')
    })
  }
}
