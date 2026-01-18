import csv from 'csv-parser'
import fs from 'fs'

import { normalizeValue } from '#services/product_csv_import/csv_value_utils'

export default class CsvReader {
  read(filePath: string): Promise<{ rows: any[]; separator: string }> {
    const firstLine = (fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[0] || '').trim()
    const commaCount = (firstLine.match(/,/g) || []).length
    const semiCount = (firstLine.match(/;/g) || []).length
    const separator = semiCount > commaCount ? ';' : ','

    const rows: any[] = []

    return new Promise<{ rows: any[]; separator: string }>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            separator,
            mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim().toLowerCase(),
            mapValues: ({ value }) => normalizeValue(value),
          })
        )
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve({ rows, separator }))
        .on('error', (err) => reject(err))
    })
  }
}
