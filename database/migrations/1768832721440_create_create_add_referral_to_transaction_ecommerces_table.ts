import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'transaction_ecommerces'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('referral_code_id')
        .unsigned()
        .nullable()
        .references('referral_codes.id')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')

      table.string('referral_code', 32).nullable()
      table.decimal('referral_discount_percent', 5, 2).notNullable().defaultTo(0)
      table.decimal('referral_discount_amount', 12, 2).notNullable().defaultTo(0)

      table.index(['referral_code_id'])
      table.index(['referral_code'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['referral_code_id'])
      table.dropIndex(['referral_code'])

      table.dropColumn('referral_code_id')
      table.dropColumn('referral_code')
      table.dropColumn('referral_discount_percent')
      table.dropColumn('referral_discount_amount')
    })
  }
}
