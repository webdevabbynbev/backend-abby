import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'referral_codes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table.string('code', 32).notNullable().unique() // contoh: ABC123
      table.decimal('discount_percent', 5, 2).notNullable().defaultTo(0) // contoh: 10.00

      table.tinyint('is_active').notNullable().defaultTo(1)
      table.dateTime('started_at').nullable()
      table.dateTime('expired_at').nullable()

      // optional (kalau mau limit pemakaian; bisa dihapus kalau belum kepake)
      table.integer('max_uses_total').unsigned().nullable()
      table.integer('max_uses_per_user').unsigned().nullable()

      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('deleted_at', { useTz: true }).nullable()

      table.index(['is_active'])
      table.index(['started_at'])
      table.index(['expired_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
