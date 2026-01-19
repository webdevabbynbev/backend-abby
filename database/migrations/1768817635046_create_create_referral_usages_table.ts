import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'referral_usages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .integer('referrer_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table
        .integer('referee_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table
        .integer('transaction_id')
        .unsigned()
        .notNullable()
        .references('transactions.id')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      // 0=PENDING, 1=SUCCESS, 2=CANCELED
      table.tinyint('status').notNullable().defaultTo(0)

      // voucher hadiah yang dibuat saat SUCCESS (opsional tapi enak buat idempotency)
      table.integer('reward_voucher_id').unsigned().nullable()
      table.integer('reward_voucher_claim_id').unsigned().nullable()

      table.timestamp('processed_at', { useTz: true }).nullable()

      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())

      table.unique(['transaction_id'])
      table.index(['referrer_user_id'])
      table.index(['referee_user_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
