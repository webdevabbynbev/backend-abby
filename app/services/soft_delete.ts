import { DateTime } from 'luxon'
import { LucidRow, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { BaseModel } from '@adonisjs/lucid/orm'

export const softDeleteQuery = (query: ModelQueryBuilderContract<typeof BaseModel>) => {
  query.whereNull('deleted_at')
}
export const softDelete = async (row: LucidRow, column: string = 'deletedAt') => {
  if (row) {
    row.$attributes[column] = DateTime.local()

    await row.save()
  }
}
