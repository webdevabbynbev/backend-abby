import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'transactions'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // nomor transaksi unik
      table.string('transaction_number').notNullable().unique()

      // nominal
      table.decimal('amount', 12, 2).notNullable()
      table.decimal('discount', 12, 2).defaultTo(0)
      table.tinyint('discount_type').defaultTo(0) // 0=none, 1=percentage, 2=nominal
      table.decimal('sub_total', 12, 2).notNullable()
      table.decimal('grand_total', 12, 2).notNullable()

      // status
      table.tinyint('payment_status').defaultTo(1)

      // channel transaksi
      table.enum('channel', ['ecommerce', 'pos']).notNullable()

      // relasi ke user
      table
        .integer('user_id')
        .unsigned()
        .references('users.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      // catatan transaksi
      table.text('note').nullable()

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
