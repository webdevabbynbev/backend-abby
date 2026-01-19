import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

  private isPostgres() {
    return (this.db as any)?.client?.dialect?.name === 'postgres'
  }

  async up() {
    if (!this.isPostgres()) return

    await this.db.rawQuery(
      `SELECT setval(
        pg_get_serial_sequence('${this.tableName}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${this.tableName}), 1),
        true
      )`
    )
  }

  async down() {
    // no-op
  }
}