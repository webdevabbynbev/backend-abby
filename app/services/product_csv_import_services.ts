import Database from '@adonisjs/lucid/services/db'

import CsvReader from '#services/product_csv_import/csv_reader'
import ProductCsvSchemaDetector from '#services/product_csv_import/schema_detector'

import TemplateImporter from '#services/product_csv_import/importers/template_importer'
import MasterImporter from '#services/product_csv_import/importers/master_importer'
import MasterProcessor from '#services/product_csv_import/master/master_processor'

import type { ImportError, MasterStats } from '#services/product_csv_import/types'

export default class ProductCsvImportService {
  private reader = new CsvReader()
  private schemaDetector = new ProductCsvSchemaDetector()

  private templateImporter = new TemplateImporter()
  private masterImporter = new MasterImporter()
  private masterProcessor = new MasterProcessor()

  async import(filePath: string): Promise<{
    success: boolean
    errors: Array<{ row: number | string; name?: string; message: string }>
    stats?: MasterStats
  }> {
    const errors: ImportError[] = []
    const { rows } = await this.reader.read(filePath)

    if (!rows.length) {
      return { success: false, errors: [{ row: '-', message: 'File CSV kosong' }] }
    }

    const isMasterSchema = this.schemaDetector.isMasterSchema(Object.keys(rows[0] || {}))

    if (isMasterSchema) {
      const { groups, stats } = this.masterImporter.group(rows, errors)

      await Database.transaction(async (trx) => {
        await this.masterProcessor.process(groups, stats, trx, errors)
      })

      return { success: errors.length === 0, errors, stats }
    }

    const { validRows } = this.templateImporter.validate(rows, errors)

    await Database.transaction(async (trx) => {
      await this.templateImporter.process(validRows, trx)
    })

    return { success: errors.length === 0, errors }
  }
}
