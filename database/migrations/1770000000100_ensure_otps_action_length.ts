import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'otps'

  private async getActionLength(): Promise<number | null> {
    // PostgreSQL query (Supabase uses PostgreSQL)
    const result: any = await this.db.rawQuery(
      `SELECT character_maximum_length AS length
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = ?
         AND column_name = 'action'`,
      [this.tableName]
    )
    
    const rows = result?.rows ?? []
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