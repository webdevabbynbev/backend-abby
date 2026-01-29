import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  private async hasColumn(table: string, column: string) {
    const isPostgres = (this.db as any)?.client?.dialect?.name === 'postgres'
    const schemaCheck = isPostgres ? "table_schema = current_schema()" : "TABLE_SCHEMA = DATABASE()"
    
    const result: any = await this.db.rawQuery(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE ${schemaCheck}
         AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = ?
         AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = ?`,
      [table, column]
    )

    const rows = Array.isArray(result) ? result[0] : (result?.rows ?? result)
    return Number(rows?.[0]?.total ?? 0) > 0
  }

  async up() {
    if (await this.hasColumn(this.tableName, 'is_flash_sale')) return

    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_flash_sale').notNullable().defaultTo(false)
    })
  }

  async down() {
    if (!(await this.hasColumn(this.tableName, 'is_flash_sale'))) return

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_flash_sale')
    })
  }
}