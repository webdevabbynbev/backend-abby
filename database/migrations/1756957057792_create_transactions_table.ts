import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'transactions'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id') // Primary key

      table.string('transaction_number').notNullable().unique()
      table.decimal('amount', 12, 2).notNullable()
      table.decimal('discount', 12, 2).defaultTo(0)
      table.tinyint('discount_type').defaultTo(0)
      table.decimal('ppn', 12, 2).defaultTo(0)
      table.decimal('shipping_cost', 12, 2).defaultTo(0)
      table.decimal('sub_total', 12, 2).notNullable()

      table.tinyint('status').defaultTo(1)

      // Midtrans integration
      table.text('token_midtrans').nullable()
      table.text('redirect_url').nullable()
      table.string('payment_method').nullable()

      // Relasi
      table
        .integer('user_id')
        .unsigned()
        .references('users.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table
        .integer('user_addresses_id')
        .unsigned()
        .references('user_addresses.id')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')
        .nullable()

      table
        .integer('voucher_id')
        .unsigned()
        .references('vouchers.id')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')
        .nullable()

      // Timestamps
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('deleted_at', { useTz: true }).nullable()
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
