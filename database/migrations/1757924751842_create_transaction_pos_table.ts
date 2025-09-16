import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'transaction_pos'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // relasi ke transaksi utama
      table
        .integer('transaction_id')
        .unsigned()
        .references('transactions.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      // kasir yang handle
      table
        .integer('cashier_id')
        .unsigned()
        .references('users.id')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')
        .nullable()

      // pembayaran POS
      table.string('payment_method').notNullable() // cash, qris, debit, dll
      table.decimal('received_amount', 12, 2).defaultTo(0)
      table.decimal('change_amount', 12, 2).defaultTo(0)

      // timestamps
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('deleted_at', { useTz: true }).nullable()
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
