import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'referral_redemptions'

  public async up() {
    // biar aman kalau pernah kebentuk sebelumnya
    if (await this.schema.hasTable(this.tableName)) {
      return
    }

    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // snapshot (biar transaksi lama gak berubah kalau admin edit referral_codes)
      table.string('referral_code', 32).notNullable()
      table.decimal('discount_percent', 5, 2).notNullable().defaultTo(0)
      table.decimal('discount_amount', 12, 2).notNullable().defaultTo(0)

      table
        .integer('referral_code_id')
        .unsigned()
        .references('id')
        .inTable('referral_codes')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')
        .nullable()

      table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
        .notNullable()

      table
        .integer('transaction_id')
        .unsigned()
        .references('id')
        .inTable('transactions')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
        .notNullable()

      // 0=PENDING, 1=SUCCESS, 2=CANCELED
      table.tinyint('status').notNullable().defaultTo(0)
      table.timestamp('processed_at', { useTz: true }).nullable()

      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())

      // 1 transaksi cuma boleh 1 referral
      table.unique(['transaction_id'])

      table.index(['user_id'])
      table.index(['referral_code_id'])
      table.index(['status'])
    })
  }

  public async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
