import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddDiscountToTransactionEcommerces extends BaseSchema {
  protected tableName = 'transaction_ecommerces'

  public async up() {
    const schema = (this.schema as any)

    const hasDiscountId = await schema.hasColumn(this.tableName, 'discount_id')
    const hasDiscountCode = await schema.hasColumn(this.tableName, 'discount_code')
    const hasDiscountAmount = await schema.hasColumn(this.tableName, 'discount_amount')

    this.schema.alterTable(this.tableName, (table) => {
      if (!hasDiscountId) {
        table
          .integer('discount_id')
          .unsigned()
          .references('id')
          .inTable('discounts')
          .onDelete('SET NULL')
          .onUpdate('CASCADE')
          .nullable()
        table.index(['discount_id'])
      }

      if (!hasDiscountCode) {
        table.string('discount_code', 50).nullable()
        table.index(['discount_code'])
      }

      if (!hasDiscountAmount) {
        table.decimal('discount_amount', 12, 2).notNullable().defaultTo(0)
      }
    })
  }

  public async down() {
    const schema = (this.schema as any)

    const hasDiscountId = await schema.hasColumn(this.tableName, 'discount_id')
    const hasDiscountCode = await schema.hasColumn(this.tableName, 'discount_code')
    const hasDiscountAmount = await schema.hasColumn(this.tableName, 'discount_amount')

    this.schema.alterTable(this.tableName, (table) => {
      if (hasDiscountId) {
        table.dropIndex(['discount_id'])
        table.dropColumn('discount_id')
      }

      if (hasDiscountCode) {
        table.dropIndex(['discount_code'])
        table.dropColumn('discount_code')
      }

      if (hasDiscountAmount) {
        table.dropColumn('discount_amount')
      }
    })
  }
}