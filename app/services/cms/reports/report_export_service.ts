import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import { ReportFormat } from '#enums/report_types'
import Report from '#models/report'

interface ExportColumn {
  header: string
  key: string
  width?: number
  type?: 'string' | 'number' | 'date' | 'currency'
}

interface ExportData {
  columns: ExportColumn[]
  rows: any[]
  summary?: any
  title: string
  generatedAt?: DateTime
}

export class ReportExportService {
  /**
   * Export report data to specified format
   */
  async exportReport(report: Report, format: ReportFormat): Promise<Buffer> {
    const exportData = this.prepareExportData(report)

    switch (format) {
      case ReportFormat.EXCEL:
        return this.exportToExcel(exportData)
      case ReportFormat.PDF:
        return this.exportToPDF(exportData)
      case ReportFormat.CSV:
        return this.exportToCSV(exportData)
      case ReportFormat.JSON:
        return this.exportToJSON(exportData)
      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }

  /**
   * Prepare data for export based on report type
   */
  private prepareExportData(report: Report): ExportData {
    const reportData = report.data as any
    const summary = report.summary as any

    // Define columns based on report type
    let columns: ExportColumn[] = []
    let rows: any[] = []

    switch (report.reportType) {
      case 'sales':
        columns = [
          { header: 'Date/Period', key: 'period', width: 15 },
          { header: 'Transactions', key: 'transactions', width: 15, type: 'number' },
          { header: 'Revenue', key: 'revenue', width: 20, type: 'currency' },
          { header: 'Discount', key: 'discount', width: 20, type: 'currency' },
          { header: 'Items Sold', key: 'items_sold', width: 15, type: 'number' },
        ]
        rows = Array.isArray(reportData) ? reportData : Object.values(reportData || {})
        break

      case 'transaction':
        columns = [
          { header: 'Transaction ID', key: 'transaction_number', width: 20 },
          { header: 'Date', key: 'date', width: 15, type: 'date' },
          { header: 'Customer', key: 'customer_name', width: 25 },
          { header: 'Items', key: 'total_items', width: 10, type: 'number' },
          { header: 'Subtotal', key: 'subtotal', width: 20, type: 'currency' },
          { header: 'Discount', key: 'discount', width: 20, type: 'currency' },
          { header: 'Total', key: 'grand_total', width: 20, type: 'currency' },
          { header: 'Status', key: 'status', width: 15 },
        ]
        rows = Array.isArray(reportData) ? reportData : []
        break

      case 'sales_product':
        columns = [
          { header: 'Product Name', key: 'product_name', width: 30 },
          { header: 'SKU', key: 'sku', width: 20 },
          { header: 'Qty Sold', key: 'qty_sold', width: 15, type: 'number' },
          { header: 'Revenue', key: 'revenue', width: 20, type: 'currency' },
          { header: 'Avg Price', key: 'avg_price', width: 20, type: 'currency' },
        ]
        rows = Array.isArray(reportData) ? reportData : []
        break

      case 'revenue':
        columns = [
          { header: 'Period', key: 'period', width: 15 },
          { header: 'Gross Revenue', key: 'gross_revenue', width: 20, type: 'currency' },
          { header: 'Discounts', key: 'discounts', width: 20, type: 'currency' },
          { header: 'Net Revenue', key: 'net_revenue', width: 20, type: 'currency' },
          { header: 'Transactions', key: 'transactions', width: 15, type: 'number' },
        ]
        rows = Array.isArray(reportData) ? reportData : Object.values(reportData || {})
        break

      case 'customer':
        columns = [
          { header: 'Customer Name', key: 'name', width: 25 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Phone', key: 'phone', width: 20 },
          { header: 'Orders', key: 'total_orders', width: 10, type: 'number' },
          { header: 'Total Spent', key: 'total_spent', width: 20, type: 'currency' },
          { header: 'Avg Order Value', key: 'avg_order_value', width: 20, type: 'currency' },
          { header: 'Last Order', key: 'last_order_date', width: 15, type: 'date' },
        ]
        rows = Array.isArray(reportData) ? reportData : []
        break

      case 'inventory':
        columns = [
          { header: 'Product Name', key: 'product_name', width: 30 },
          { header: 'SKU', key: 'sku', width: 20 },
          { header: 'Current Stock', key: 'current_stock', width: 15, type: 'number' },
          { header: 'Reserved', key: 'reserved_stock', width: 15, type: 'number' },
          { header: 'Available', key: 'available_stock', width: 15, type: 'number' },
          { header: 'Value', key: 'stock_value', width: 20, type: 'currency' },
        ]
        rows = Array.isArray(reportData) ? reportData : []
        break

      default:
        // Generic fallback
        columns = Object.keys(reportData?.[0] || {}).map(key => ({ 
          header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), 
          key 
        }))
        rows = Array.isArray(reportData) ? reportData : []
    }

    return {
      columns,
      rows,
      summary,
      title: report.title,
      generatedAt: report.generatedAt || DateTime.now(),
    }
  }

  /**
   * Export to Excel format
   */
  private async exportToExcel(data: ExportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Report')

    // Add title
    worksheet.mergeCells(1, 1, 1, data.columns.length)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = data.title
    titleCell.font = { size: 16, bold: true }
    titleCell.alignment = { horizontal: 'center' }

    // Add generated date
    worksheet.mergeCells(2, 1, 2, data.columns.length)
    const dateCell = worksheet.getCell(2, 1)
    dateCell.value = `Generated: ${data.generatedAt?.toFormat('yyyy-MM-dd HH:mm:ss')}`
    dateCell.font = { size: 10, italic: true }
    dateCell.alignment = { horizontal: 'center' }

    // Add headers (row 4)
    const headerRow = worksheet.getRow(4)
    data.columns.forEach((col, index) => {
      const cell = headerRow.getCell(index + 1)
      cell.value = col.header
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    })

    // Set column widths
    data.columns.forEach((col, index) => {
      worksheet.getColumn(index + 1).width = col.width || 15
    })

    // Add data rows
    data.rows.forEach((row, rowIndex) => {
      const excelRow = worksheet.getRow(rowIndex + 5)
      data.columns.forEach((col, colIndex) => {
        const cell = excelRow.getCell(colIndex + 1)
        let value = row[col.key]

        // Format based on type
        if (col.type === 'currency' && typeof value === 'number') {
          cell.numFmt = '#,##0.00'
          cell.value = value
        } else if (col.type === 'number' && typeof value === 'number') {
          cell.numFmt = '#,##0'
          cell.value = value
        } else if (col.type === 'date' && value) {
          if (typeof value === 'string') {
            cell.value = new Date(value)
          } else {
            cell.value = value
          }
          cell.numFmt = 'yyyy-mm-dd'
        } else {
          cell.value = value || ''
        }

        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })

    // Add summary if available
    if (data.summary) {
      const summaryStartRow = data.rows.length + 7
      worksheet.mergeCells(summaryStartRow, 1, summaryStartRow, data.columns.length)
      const summaryTitleCell = worksheet.getCell(summaryStartRow, 1)
      summaryTitleCell.value = 'Summary'
      summaryTitleCell.font = { size: 14, bold: true }

      let currentRow = summaryStartRow + 1
      Object.entries(data.summary).forEach(([key, value]) => {
        const keyCell = worksheet.getCell(currentRow, 1)
        const valueCell = worksheet.getCell(currentRow, 2)
        keyCell.value = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        keyCell.font = { bold: true }
        
        if (typeof value === 'number' && (key.includes('revenue') || key.includes('total') || key.includes('amount'))) {
          valueCell.numFmt = '#,##0.00'
        }
        valueCell.value = value as ExcelJS.CellValue
        currentRow++
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return buffer as unknown as Buffer
  }

  /**
   * Export to PDF format (Simple HTML-to-PDF approach)
   */
  private async exportToPDF(data: ExportData): Promise<Buffer> {
    // For now, return a simple text-based PDF approach
    // You can integrate with puppeteer or other PDF libraries later
    const htmlContent = this.generateHTMLReport(data)
    
    // Simple fallback - return HTML as text for now
    // In production, you should use puppeteer or similar
    const pdfContent = `
PDF Report: ${data.title}
Generated: ${data.generatedAt?.toFormat('yyyy-MM-dd HH:mm:ss')}

${'='.repeat(80)}

${data.columns.map(col => col.header).join('\t')}
${'-'.repeat(80)}
${data.rows.map(row => 
  data.columns.map(col => {
    let value = row[col.key] || ''
    if (col.type === 'currency' && typeof value === 'number') {
      value = new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR' 
      }).format(value)
    }
    return String(value)
  }).join('\t')
).join('\n')}

${'='.repeat(80)}
SUMMARY:
${data.summary ? Object.entries(data.summary).map(([key, value]) => {
  const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  let formattedValue = value
  if (typeof value === 'number' && (key.includes('revenue') || key.includes('total') || key.includes('amount'))) {
    formattedValue = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(value)
  }
  return `${formattedKey}: ${formattedValue}`
}).join('\n') : 'No summary available'}
    `

    return Buffer.from(pdfContent, 'utf-8')
  }

  /**
   * Generate HTML content for PDF (future use with puppeteer)
   */
  private generateHTMLReport(data: ExportData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>${data.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .date { font-size: 12px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    .summary { background-color: #f9f9f9; padding: 15px; border-radius: 5px; }
    .summary-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${data.title}</div>
    <div class="date">Generated: ${data.generatedAt?.toFormat('yyyy-MM-dd HH:mm:ss')}</div>
  </div>
  
  <table>
    <thead>
      <tr>
        ${data.columns.map(col => `<th>${col.header}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.rows.map(row => `
        <tr>
          ${data.columns.map(col => {
            let value = row[col.key] || ''
            if (col.type === 'currency' && typeof value === 'number') {
              value = new Intl.NumberFormat('id-ID', { 
                style: 'currency', 
                currency: 'IDR' 
              }).format(value)
            } else if (col.type === 'number' && typeof value === 'number') {
              value = value.toLocaleString('id-ID')
            } else if (col.type === 'date' && value) {
              value = DateTime.fromJSDate(new Date(value)).toFormat('yyyy-MM-dd')
            }
            return `<td>${String(value)}</td>`
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  ${data.summary ? `
    <div class="summary">
      <div class="summary-title">Summary</div>
      ${Object.entries(data.summary).map(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        let formattedValue = value
        if (typeof value === 'number' && (key.includes('revenue') || key.includes('total') || key.includes('amount'))) {
          formattedValue = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(value)
        }
        return `<p><strong>${formattedKey}:</strong> ${formattedValue}</p>`
      }).join('')}
    </div>
  ` : ''}
</body>
</html>
    `
  }

  /**
   * Export to CSV format
   */
  private async exportToCSV(data: ExportData): Promise<Buffer> {
    const csvRows: string[] = []

    // Add title and date
    csvRows.push(`"${data.title}"`)
    csvRows.push(`"Generated: ${data.generatedAt?.toFormat('yyyy-MM-dd HH:mm:ss')}"`)
    csvRows.push('') // Empty row

    // Add headers
    const headers = data.columns.map(col => `"${col.header}"`).join(',')
    csvRows.push(headers)

    // Add data rows
    data.rows.forEach(row => {
      const values = data.columns.map(col => {
        const value = row[col.key]
        if (value === null || value === undefined) return '""'
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return `"${String(value)}"`
      }).join(',')
      csvRows.push(values)
    })

    // Add summary
    if (data.summary) {
      csvRows.push('') // Empty row
      csvRows.push('"Summary"')
      Object.entries(data.summary).forEach(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        csvRows.push(`"${formattedKey}","${value}"`)
      })
    }

    return Buffer.from(csvRows.join('\n'), 'utf-8')
  }

  /**
   * Export to JSON format
   */
  private async exportToJSON(data: ExportData): Promise<Buffer> {
    const jsonData = {
      title: data.title,
      generated_at: data.generatedAt?.toISO(),
      columns: data.columns,
      data: data.rows,
      summary: data.summary,
      total_records: data.rows.length,
    }

    return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8')
  }

  /**
   * Get MIME type for format
   */
  getMimeType(format: ReportFormat): string {
    switch (format) {
      case ReportFormat.EXCEL:
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      case ReportFormat.PDF:
        return 'text/plain' // Changed from application/pdf since we're using simple text
      case ReportFormat.CSV:
        return 'text/csv'
      case ReportFormat.JSON:
        return 'application/json'
      default:
        return 'application/octet-stream'
    }
  }

  /**
   * Get file extension for format
   */
  getFileExtension(format: ReportFormat): string {
    switch (format) {
      case ReportFormat.EXCEL:
        return 'xlsx'
      case ReportFormat.PDF:
        return 'txt' // Changed from pdf since we're using simple text
      case ReportFormat.CSV:
        return 'csv'
      case ReportFormat.JSON:
        return 'json'
      default:
        return 'bin'
    }
  }
}