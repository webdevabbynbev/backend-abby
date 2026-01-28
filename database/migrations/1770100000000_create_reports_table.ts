import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reports'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Report metadata
      table.string('report_number').unique().notNullable()
      table.string('title').notNullable()
      table.text('description').nullable()
      
      // Report type and configuration
      table.enum('report_type', ['sales', 'product', 'transaction', 'revenue', 'customer', 'inventory']).notNullable()
      table.enum('report_period', ['daily', 'weekly', 'monthly', 'yearly', 'custom']).notNullable()
      table.enum('report_format', ['pdf', 'excel', 'csv', 'json']).notNullable()
      table.enum('channel', ['all', 'ecommerce', 'pos']).defaultTo('all')
      
      // Date range
      table.dateTime('start_date').notNullable()
      table.dateTime('end_date').notNullable()
      
      // Report status
      table.enum('status', ['pending', 'processing', 'completed', 'failed']).defaultTo('pending')
      
      // Report data and file
      table.json('filters').nullable() // Additional filters as JSON
      table.json('data').nullable() // Report data as JSON
      table.json('summary').nullable() // Summary statistics
      table.string('file_path').nullable() // Path to generated file
      table.string('file_url').nullable() // Public URL if uploaded to cloud
      
      // User who requested the report
      table.integer('user_id').unsigned().notNullable()
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      
      // Processing info
      table.dateTime('generated_at').nullable()
      table.text('error_message').nullable()
      
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.timestamp('deleted_at', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
