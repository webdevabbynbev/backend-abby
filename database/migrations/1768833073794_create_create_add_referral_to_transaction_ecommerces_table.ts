import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'transaction_ecommerces'

  async up() {
    // referral_code_id
    if (!(await this.schema.hasColumn(this.tableName, 'referral_code_id'))) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.integer('referral_code_id').nullable()
      })
    }

    // referral_code
    if (!(await this.schema.hasColumn(this.tableName, 'referral_code'))) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.string('referral_code', 32).nullable()
      })
    }

    // referral_discount_percent
    if (!(await this.schema.hasColumn(this.tableName, 'referral_discount_percent'))) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.decimal('referral_discount_percent', 5, 2).notNullable().defaultTo(0)
      })
    }

    // referral_discount_amount
    if (!(await this.schema.hasColumn(this.tableName, 'referral_discount_amount'))) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.decimal('referral_discount_amount', 12, 2).notNullable().defaultTo(0)
      })
    }
  }

  async down() {
    // drop kolom hanya kalau memang ada (biar aman)
    if (await this.schema.hasColumn(this.tableName, 'referral_discount_amount')) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.dropColumn('referral_discount_amount')
      })
    }

    if (await this.schema.hasColumn(this.tableName, 'referral_discount_percent')) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.dropColumn('referral_discount_percent')
      })
    }

    if (await this.schema.hasColumn(this.tableName, 'referral_code')) {
      await this.schema.alterTable(this.tableName, (table) => {
        table.dropColumn('referral_code')
      })
    }

  }
}
