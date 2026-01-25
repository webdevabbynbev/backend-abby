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

            // ✅ penting: buang header kosong akibat trailing commas + normalisasi
            mapHeaders: ({ header }) => {
              const h = String(header || '').replace(/^\uFEFF/, '').trim().toLowerCase()

              // csv-parser: return null => kolom di-skip
              if (!h) return null as any
              if (h.startsWith('unnamed')) return null as any

              return h
            },

            mapValues: ({ value }) => normalizeValue(value),

            // ✅ biar aman kalau jumlah kolom per baris gak selalu sama
            strict: false,
          })
        )
        .on('data', (row) => {
          // extra safety kalau masih kebawa key kosong
          if (row && typeof row === 'object' && '' in row) delete (row as any)['']
          rows.push(row)
        })
        .on('end', () => resolve({ rows, separator }))
        .on('error', (err) => reject(err))
    })
  }
}
