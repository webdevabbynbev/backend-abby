import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'otps'

  private isPostgres() {
    return (this.db as any)?.client?.dialect?.name === 'postgres'
  }

  private async getActionLength(): Promise<number | null> {
    if (this.isPostgres()) {
      const result: any = await this.db.rawQuery(
        `SELECT character_maximum_length AS length
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = ?
           AND column_name = 'action'`,
        [this.tableName]
      )
      const rows = Array.isArray(result) ? result[0] : (result?.rows ?? result)
      return Number(rows?.[0]?.length ?? 0) || null
    }

    const result: any = await this.db.rawQuery(
      `SELECT character_maximum_length AS length
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?
         AND column_name = 'action'`,
      [this.tableName]
    )
    const rows = Array.isArray(result) ? result[0] : (result?.rows ?? result)
    return Number(rows?.[0]?.length ?? 0) || null
  }

  async up() {
    const length = await this.getActionLength()
    if (length && length >= 50) return

    this.schema.alterTable(this.tableName, (table) => {
      table.string('action', 50).alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('action', 20).alter()
    })
  }
}