import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'category_types'

  private async hasColumn(column: string) {
    const isPostgres = (this.db as any)?.client?.dialect?.name === 'postgres'
    const schemaCheck = isPostgres ? "table_schema = current_schema()" : "TABLE_SCHEMA = DATABASE()"
    
    const result: any = await this.db.rawQuery(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE ${schemaCheck}
         AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = ?
         AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = ?`,
      [this.tableName, column]
    )

    // mysql2 umumnya balikin [rows, fields]
    const rows = Array.isArray(result) ? result[0] : (result?.rows ?? result)
    return Number(rows?.[0]?.total ?? 0) > 0
  }

  async up() {
    if (await this.hasColumn('icon_public_id')) return

    this.schema.alterTable(this.tableName, (table) => {
      table.string('icon_public_id', 255).nullable()
    })
  }

  async down() {
    if (!(await this.hasColumn('icon_public_id'))) return

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('icon_public_id')
    })
  }
}