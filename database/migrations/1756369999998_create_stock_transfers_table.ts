import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateStockTransfersTable extends BaseSchema {
  protected tableName = 'stock_transfers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      table
        .integer('product_variant_id')
        .unsigned()
        .references('id')
        .inTable('product_variants')
        .onDelete('CASCADE')

      table.string('from_channel', 50).notNullable()
      table.string('to_channel', 50).notNullable()
      table.integer('quantity').notNullable()
      
      table.enum('status', ['pending', 'approved', 'completed', 'rejected']).defaultTo('pending')
      
      table.text('note').nullable()
      table.string('requested_by', 100).nullable() // user yang request
      table.string('approved_by', 100).nullable() // user yang approve
      
      table.timestamp('requested_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('approved_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())

      table.index(['status'])
      table.index(['from_channel'])
      table.index(['to_channel'])
      table.index(['product_variant_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}