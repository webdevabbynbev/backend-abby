import { DateTime } from 'luxon'
import Report from '#models/report'
import Transaction from '#models/transaction'
import TransactionDetail from '#models/transaction_detail'
import Product from '#models/product'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { ReportType, ReportPeriod, ReportStatus, ReportFormat, ReportChannel } from '#enums/report_types'
import { TransactionStatus } from '#enums/transaction_status'

interface ReportFilters {
  channel?: ReportChannel
  productIds?: number[]
  variantIds?: number[]
  categoryIds?: number[]
  brandIds?: number[]
  userIds?: number[]
  minAmount?: number
  maxAmount?: number
  status?: TransactionStatus
  [key: string]: any
}

interface CreateReportDTO {
  title: string
  description?: string
  reportType: ReportType
  reportPeriod: ReportPeriod
  reportFormat: ReportFormat
  startDate: DateTime
  endDate: DateTime
  channel?: ReportChannel
  filters?: ReportFilters
  userId: number
}

export class ReportService {
  /**
   * Generate unique report number
   */
  private async generateReportNumber(): Promise<string> {
    const date = DateTime.now().toFormat('yyyyMMdd')
    const lastReport = await Report.query()
      .where('report_number', 'like', `RPT-${date}%`)
      .orderBy('id', 'desc')
      .first()

    let sequence = 1
    if (lastReport) {
      const lastSequence = parseInt(lastReport.reportNumber.split('-').pop() || '0')
      sequence = lastSequence + 1
    }

    return `RPT-${date}-${sequence.toString().padStart(4, '0')}`
  }

  /**
   * Create a new report request
   */
  async createReport(data: CreateReportDTO): Promise<Report> {
    const reportNumber = await this.generateReportNumber()

    const report = await Report.create({
      reportNumber,
      title: data.title,
      description: data.description || null,
      reportType: data.reportType,
      reportPeriod: data.reportPeriod,
      reportFormat: data.reportFormat,
      startDate: data.startDate,
      endDate: data.endDate,
      channel: data.channel || ReportChannel.ALL,
      filters: data.filters || null,
      status: ReportStatus.PENDING,
      userId: data.userId,
    })

    // Start processing in background (you can use a queue here)
    this.processReport(report.id).catch(console.error)

    return report
  }

  /**
   * Process and generate report
   */
  async processReport(reportId: number): Promise<void> {
    const report = await Report.findOrFail(reportId)

    try {
      // Update status to processing
      report.status = ReportStatus.PROCESSING
      await report.save()

      // Generate report data based on type
      let reportData: any = {}
      let summary: any = {}

      switch (report.reportType) {
        case ReportType.SALES:
          const salesData = await this.generateSalesReport(report)
          reportData = salesData.data
          summary = salesData.summary
          break

        case ReportType.SALES_PRODUCT:
          const salesProductData = await this.generateSalesProductReport(report)
          reportData = salesProductData.data
          summary = salesProductData.summary
          break

        case ReportType.TRANSACTION:
          const transactionData = await this.generateTransactionReport(report)
          reportData = transactionData.data
          summary = transactionData.summary
          break

        case ReportType.REVENUE:
          const revenueData = await this.generateRevenueReport(report)
          reportData = revenueData.data
          summary = revenueData.summary
          break

        case ReportType.CUSTOMER:
          const customerData = await this.generateCustomerReport(report)
          reportData = customerData.data
          summary = customerData.summary
          break

        case ReportType.INVENTORY:
          const inventoryData = await this.generateInventoryReport(report)
          reportData = inventoryData.data
          summary = inventoryData.summary
          break
      }

      // Save report data
      report.data = reportData
      report.summary = summary
      report.status = ReportStatus.COMPLETED
      report.generatedAt = DateTime.now()
      await report.save()
    } catch (error: any) {
      report.status = ReportStatus.FAILED
      report.errorMessage = error.message
      await report.save()
      throw error
    }
  }

  /**
   * Generate Sales Report
   * Support: daily, weekly, monthly, yearly period
   */
  private async generateSalesReport(report: Report) {
    const query = Transaction.query()
      .whereBetween('created_at', [report.startDate.toJSDate(), report.endDate.toJSDate()])
      .where('transaction_status', TransactionStatus.COMPLETED)

    if (report.channel !== ReportChannel.ALL) {
      query.where('channel', report.channel)
    }

    const transactions = await query
      .preload('details', (detailQuery) => {
        detailQuery.preload('product')
      })
      .preload('user')

    // Calculate summary
    const totalTransactions = transactions.length
    const totalRevenue = transactions.reduce((sum, t) => sum + t.grandTotal, 0)
    const totalDiscount = transactions.reduce((sum, t) => sum + t.discount, 0)
    const avgOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

    // Group by period based on report_period
    let groupedData: any = {}
    
    switch (report.reportPeriod) {
      case ReportPeriod.DAILY:
        // Group by date
        groupedData = transactions.reduce((acc: any, t) => {
          const date = t.createdAt.toFormat('yyyy-MM-dd')
          if (!acc[date]) {
            acc[date] = {
              date,
              period: date,
              transactions: 0,
              revenue: 0,
              discount: 0,
              items_sold: 0,
            }
          }
          acc[date].transactions += 1
          acc[date].revenue += t.grandTotal
          acc[date].discount += t.discount
          acc[date].items_sold += t.details.reduce((sum, d) => sum + d.qty, 0)
          return acc
        }, {})
        break

      case ReportPeriod.WEEKLY:
        // Group by week (ISO week)
        groupedData = transactions.reduce((acc: any, t) => {
          const week = t.createdAt.toFormat('kkkk-\'W\'WW') // Format: 2026-W04
          if (!acc[week]) {
            acc[week] = {
              period: week,
              week_start: t.createdAt.startOf('week').toFormat('yyyy-MM-dd'),
              week_end: t.createdAt.endOf('week').toFormat('yyyy-MM-dd'),
              transactions: 0,
              revenue: 0,
              discount: 0,
              items_sold: 0,
            }
          }
          acc[week].transactions += 1
          acc[week].revenue += t.grandTotal
          acc[week].discount += t.discount
          acc[week].items_sold += t.details.reduce((sum, d) => sum + d.qty, 0)
          return acc
        }, {})
        break

      case ReportPeriod.MONTHLY:
        // Group by month
        groupedData = transactions.reduce((acc: any, t) => {
          const month = t.createdAt.toFormat('yyyy-MM')
          if (!acc[month]) {
            acc[month] = {
              period: month,
              month_name: t.createdAt.toFormat('MMMM yyyy'),
              transactions: 0,
              revenue: 0,
              discount: 0,
              items_sold: 0,
            }
          }
          acc[month].transactions += 1
          acc[month].revenue += t.grandTotal
          acc[month].discount += t.discount
          acc[month].items_sold += t.details.reduce((sum, d) => sum + d.qty, 0)
          return acc
        }, {})
        break

      case ReportPeriod.YEARLY:
        // Group by year
        groupedData = transactions.reduce((acc: any, t) => {
          const year = t.createdAt.toFormat('yyyy')
          if (!acc[year]) {
            acc[year] = {
              period: year,
              year: year,
              transactions: 0,
              revenue: 0,
              discount: 0,
              items_sold: 0,
            }
          }
          acc[year].transactions += 1
          acc[year].revenue += t.grandTotal
          acc[year].discount += t.discount
          acc[year].items_sold += t.details.reduce((sum, d) => sum + d.qty, 0)
          return acc
        }, {})
        break

      case ReportPeriod.CUSTOM:
        // Just show overall summary without grouping
        groupedData = {
          custom: {
            period: 'custom',
            transactions: totalTransactions,
            revenue: totalRevenue,
            discount: totalDiscount,
            items_sold: transactions.reduce((sum, t) => sum + t.details.reduce((s, d) => s + d.qty, 0), 0),
          }
        }
        break
    }

    return {
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          transaction_number: t.transactionNumber,
          date: t.createdAt.toFormat('yyyy-MM-dd HH:mm:ss'),
          customer: t.user?.name || '-',
          channel: t.channel,
          amount: t.amount,
          discount: t.discount,
          grand_total: t.grandTotal,
          items_count: t.details.length,
          total_qty: t.details.reduce((sum, d) => sum + d.qty, 0),
        })),
        grouped_by_period: Object.values(groupedData),
      },
      summary: {
        total_transactions: totalTransactions,
        total_revenue: totalRevenue,
        total_discount: totalDiscount,
        avg_order_value: avgOrderValue,
        report_period: report.reportPeriod,
        period: `${report.startDate.toFormat('yyyy-MM-dd')} to ${report.endDate.toFormat('yyyy-MM-dd')}`,
      },
    }
  }

  /**
   * Generate Sales Product Report
   * Support filter by: product, brand, variant
   */
  private async generateSalesProductReport(report: Report) {
    const filters = report.filters || {}
    
    // Build dynamic WHERE clauses
    const brandFilter = filters.brandIds && filters.brandIds.length > 0 
      ? `AND p.brand_id IN (${filters.brandIds.join(',')})` 
      : ''
    
    const productFilter = filters.productIds && filters.productIds.length > 0 
      ? `AND p.id IN (${filters.productIds.join(',')})` 
      : ''
    
    const variantFilter = filters.variantIds && filters.variantIds.length > 0 
      ? `AND pv.id IN (${filters.variantIds.join(',')})` 
      : ''

    // Query untuk product-level report
    const { rows: productRows } = await db.rawQuery(
      `
      SELECT 
        p.id,
        p.name,
        p.master_sku,
        p.base_price,
        p.brand_id,
        b.name as brand_name,
        COALESCE(SUM(td.qty), 0) as total_sold,
        COALESCE(SUM(td.sub_total), 0) as total_revenue,
        COUNT(DISTINCT t.id) as total_transactions,
        COALESCE(AVG(td.price), 0) as avg_selling_price
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN transaction_details td ON td.product_id = p.id
      LEFT JOIN transactions t ON t.id = td.transaction_id 
        AND t.transaction_status = ?
        AND t.created_at BETWEEN ? AND ?
        ${report.channel !== ReportChannel.ALL ? 'AND t.channel = ?' : ''}
      WHERE p.deleted_at IS NULL
        ${brandFilter}
        ${productFilter}
      GROUP BY p.id, p.name, p.master_sku, p.base_price, p.brand_id, b.name
      HAVING COALESCE(SUM(td.qty), 0) > 0
      ORDER BY total_sold DESC
      `,
      report.channel !== ReportChannel.ALL
        ? [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate(), report.channel]
        : [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate()]
    )

    // Query untuk variant-level report
    const { rows: variantRows } = await db.rawQuery(
      `
      SELECT 
        pv.id as variant_id,
        pv.sku as variant_sku,
        p.id as product_id,
        p.name as product_name,
        p.brand_id,
        b.name as brand_name,
        COALESCE(
          (
            SELECT STRING_AGG(CONCAT(a.name, ': ', av.value), ', ')
            FROM variant_attributes va
            JOIN attribute_values av ON av.id = va.attribute_value_id
            JOIN attributes a ON a.id = av.attribute_id
            WHERE va.product_variant_id = pv.id
          ), 
          'Default'
        ) as variant_attributes,
        COALESCE(SUM(td.qty), 0) as total_sold,
        COALESCE(SUM(td.sub_total), 0) as total_revenue,
        COUNT(DISTINCT t.id) as total_transactions,
        pv.price as variant_price
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN transaction_details td ON td.product_variant_id = pv.id
      LEFT JOIN transactions t ON t.id = td.transaction_id 
        AND t.transaction_status = ?
        AND t.created_at BETWEEN ? AND ?
        ${report.channel !== ReportChannel.ALL ? 'AND t.channel = ?' : ''}
      WHERE pv.deleted_at IS NULL 
        AND p.deleted_at IS NULL
        ${brandFilter}
        ${productFilter}
        ${variantFilter}
      GROUP BY pv.id, pv.sku, p.id, p.name, p.brand_id, b.name, pv.price
      HAVING COALESCE(SUM(td.qty), 0) > 0
      ORDER BY total_sold DESC
      `,
      report.channel !== ReportChannel.ALL
        ? [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate(), report.channel]
        : [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate()]
    )

    const products = productRows.map((r: any) => ({
      id: r.id,
      name: r.name,
      sku: r.master_sku,
      base_price: Number(r.base_price),
      brand_id: r.brand_id,
      brand_name: r.brand_name || '-',
      total_sold: Number(r.total_sold),
      total_revenue: Number(r.total_revenue),
      total_transactions: Number(r.total_transactions),
      avg_selling_price: Number(r.avg_selling_price || 0),
    }))

    const variants = variantRows.map((r: any) => ({
      variant_id: r.variant_id,
      variant_sku: r.variant_sku,
      variant_attributes: r.variant_attributes,
      product_id: r.product_id,
      product_name: r.product_name,
      brand_id: r.brand_id,
      brand_name: r.brand_name || '-',
      variant_price: Number(r.variant_price),
      total_sold: Number(r.total_sold),
      total_revenue: Number(r.total_revenue),
      total_transactions: Number(r.total_transactions),
    }))

    // Group by brand if needed
    const salesByBrand = products.reduce((acc: any, p: any) => {
      const brandKey = p.brand_name || 'No Brand'
      if (!acc[brandKey]) {
        acc[brandKey] = {
          brand_name: brandKey,
          brand_id: p.brand_id,
          total_products: 0,
          total_sold: 0,
          total_revenue: 0,
        }
      }
      acc[brandKey].total_products += 1
      acc[brandKey].total_sold += p.total_sold
      acc[brandKey].total_revenue += p.total_revenue
      return acc
    }, {})

    const totalProducts = products.length
    const totalVariants = variants.length
    const totalRevenue = products.reduce((sum: number, p: any) => sum + p.total_revenue, 0)
    const totalSold = products.reduce((sum: number, p: any) => sum + p.total_sold, 0)
    const topProducts = products.slice(0, 10)
    const topVariants = variants.slice(0, 10)

    return {
      data: {
        products,
        variants,
        top_products: topProducts,
        top_variants: topVariants,
        sales_by_brand: Object.values(salesByBrand),
      },
      summary: {
        total_products: totalProducts,
        total_variants: totalVariants,
        total_revenue: totalRevenue,
        total_items_sold: totalSold,
        total_brands: Object.keys(salesByBrand).length,
        filters_applied: {
          brand_ids: filters.brandIds || [],
          product_ids: filters.productIds || [],
          variant_ids: filters.variantIds || [],
        },
        period: `${report.startDate.toFormat('yyyy-MM-dd')} to ${report.endDate.toFormat('yyyy-MM-dd')}`,
      },
    }
  }

  /**
   * Generate Transaction Report
   * Detailed per-transaction report with full breakdown
   */
  private async generateTransactionReport(report: Report) {
    const query = Transaction.query()
      .whereBetween('created_at', [report.startDate.toJSDate(), report.endDate.toJSDate()])

    if (report.channel !== ReportChannel.ALL) {
      query.where('channel', report.channel)
    }

    if (report.filters?.status) {
      query.where('transaction_status', report.filters.status)
    }

    const transactions = await query
      .preload('user')
      .preload('details', (detailQuery) => {
        detailQuery
          .preload('product', (productQuery) => {
            productQuery.preload('brand')
          })
      })
      .preload('ecommerce', (ecomQuery) => {
        ecomQuery.preload('userAddress')
      })
      .preload('pos', (posQuery) => {
        posQuery.preload('cashier')
      })
      .orderBy('created_at', 'desc')

    // Status breakdown
    const statusBreakdown = transactions.reduce((acc: any, t) => {
      const status = t.transactionStatus
      const statusLabel = this.getStatusLabel(status)
      
      if (!acc[status]) {
        acc[status] = { 
          status: status,
          label: statusLabel,
          count: 0, 
          total_amount: 0 
        }
      }
      acc[status].count += 1
      acc[status].total_amount += t.grandTotal
      return acc
    }, {})

    // Channel breakdown
    const channelBreakdown = transactions.reduce((acc: any, t) => {
      const channel = t.channel
      if (!acc[channel]) {
        acc[channel] = { 
          channel: channel,
          count: 0, 
          total_amount: 0,
          avg_amount: 0,
        }
      }
      acc[channel].count += 1
      acc[channel].total_amount += t.grandTotal
      return acc
    }, {})

    // Calculate averages for channel breakdown
    Object.keys(channelBreakdown).forEach(key => {
      channelBreakdown[key].avg_amount = 
        channelBreakdown[key].total_amount / channelBreakdown[key].count
    })

    // Payment method breakdown (for ecommerce)
    const paymentMethodBreakdown = transactions
      .filter(t => t.channel === 'ecommerce' && t.ecommerce?.paymentMethod)
      .reduce((acc: any, t) => {
        const method = t.ecommerce!.paymentMethod!
        if (!acc[method]) {
          acc[method] = {
            payment_method: method,
            count: 0,
            total_amount: 0,
          }
        }
        acc[method].count += 1
        acc[method].total_amount += t.grandTotal
        return acc
      }, {})

    // Detailed transactions
    const detailedTransactions = transactions.map((t) => ({
      id: t.id,
      transaction_number: t.transactionNumber,
      date: t.createdAt.toFormat('yyyy-MM-dd HH:mm:ss'),
      
      // Customer info
      customer: {
        id: t.user?.id,
        name: t.user?.name || '-',
        email: t.user?.email || '-',
        phone: t.user?.phoneNumber || '-',
      },
      
      // Transaction details
      status: t.transactionStatus,
      status_label: this.getStatusLabel(t.transactionStatus),
      channel: t.channel,
      
      // Amounts
      amount: t.amount,
      discount: t.discount,
      discount_type: t.discountType,
      sub_total: t.subTotal,
      grand_total: t.grandTotal,
      
      // Items
      items: t.details.map((d) => ({
        product_id: d.productId,
        product_name: d.product?.name || '-',
        brand: d.product?.brand?.name || '-',
        variant_id: d.productVariantId,
        variant_sku: d.productVariantId ? `Variant-${d.productVariantId}` : '-',
        qty: d.qty,
        price: d.price,
        discount: d.discount,
        sub_total: d.price * d.qty - d.discount,
      })),
      
      // Channel-specific data
      ecommerce: t.channel === 'ecommerce' && t.ecommerce ? {
        payment_method: t.ecommerce.paymentMethod,
        courier_name: t.ecommerce.courierName,
        courier_service: t.ecommerce.courierService,
        shipping_cost: t.ecommerce.shippingCost,
        ppn: t.ecommerce.ppn,
        shipping_address: t.ecommerce.userAddress ? {
          name: (t.ecommerce.userAddress as any).receiverName || '-',
          phone: (t.ecommerce.userAddress as any).receiverPhoneNumber || '-',
          address: (t.ecommerce.userAddress as any).address || '-',
          city: (t.ecommerce.userAddress as any).cityName || '-',
          province: (t.ecommerce.userAddress as any).provinceName || '-',
        } : null,
      } : null,
      
      pos: t.channel === 'pos' && t.pos ? {
        cashier_id: t.pos.cashierId,
        cashier_name: t.pos.cashier?.name || '-',
        payment_method: t.pos.paymentMethod,
        received_amount: t.pos.receivedAmount,
        change_amount: t.pos.changeAmount,
      } : null,
      
      note: t.note,
    }))

    const totalTransactions = transactions.length
    const totalAmount = transactions.reduce((sum, t) => sum + t.grandTotal, 0)
    const totalDiscount = transactions.reduce((sum, t) => sum + t.discount, 0)

    return {
      data: {
        transactions: detailedTransactions,
        status_breakdown: Object.values(statusBreakdown),
        channel_breakdown: Object.values(channelBreakdown),
        payment_method_breakdown: Object.values(paymentMethodBreakdown),
      },
      summary: {
        total_transactions: totalTransactions,
        total_amount: totalAmount,
        total_discount: totalDiscount,
        avg_transaction_value: totalTransactions > 0 ? totalAmount / totalTransactions : 0,
        period: `${report.startDate.toFormat('yyyy-MM-dd')} to ${report.endDate.toFormat('yyyy-MM-dd')}`,
      },
    }
  }

  /**
   * Helper: Get status label
   */
  private getStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
      '1': 'Waiting Payment',
      '2': 'On Process',
      '3': 'On Delivery',
      '4': 'Completed',
      '9': 'Failed/Cancelled',
    }
    return statusMap[status] || `Status ${status}`
  }

  /**
   * Generate Revenue Report
   */
  private async generateRevenueReport(report: Report) {
    const query = Transaction.query()
      .whereBetween('created_at', [report.startDate.toJSDate(), report.endDate.toJSDate()])
      .where('transaction_status', TransactionStatus.COMPLETED)

    if (report.channel !== ReportChannel.ALL) {
      query.where('channel', report.channel)
    }

    const transactions = await query

    // Group by date
    const revenueByDate = transactions.reduce((acc: any, t) => {
      const date = t.createdAt.toFormat('yyyy-MM-dd')
      if (!acc[date]) {
        acc[date] = {
          date,
          gross_revenue: 0,
          discount: 0,
          net_revenue: 0,
          transactions: 0,
        }
      }
      acc[date].gross_revenue += t.amount
      acc[date].discount += t.discount
      acc[date].net_revenue += t.grandTotal
      acc[date].transactions += 1
      return acc
    }, {})

    const totalGrossRevenue = transactions.reduce((sum, t) => sum + t.amount, 0)
    const totalDiscount = transactions.reduce((sum, t) => sum + t.discount, 0)
    const totalNetRevenue = transactions.reduce((sum, t) => sum + t.grandTotal, 0)

    return {
      data: {
        revenue_by_date: Object.values(revenueByDate),
      },
      summary: {
        total_gross_revenue: totalGrossRevenue,
        total_discount: totalDiscount,
        total_net_revenue: totalNetRevenue,
        total_transactions: transactions.length,
        avg_transaction_value: transactions.length > 0 ? totalNetRevenue / transactions.length : 0,
        period: `${report.startDate.toFormat('yyyy-MM-dd')} to ${report.endDate.toFormat('yyyy-MM-dd')}`,
      },
    }
  }

  /**
   * Generate Customer Report
   */
  private async generateCustomerReport(report: Report) {
    const { rows } = await db.rawQuery(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone_number,
        COUNT(t.id) as total_transactions,
        COALESCE(SUM(t.grand_total), 0) as total_spent,
        MAX(t.created_at) as last_transaction_date
      FROM users u
      LEFT JOIN transactions t ON t.user_id = u.id 
        AND t.transaction_status = ?
        AND t.created_at BETWEEN ? AND ?
        ${report.channel !== ReportChannel.ALL ? 'AND t.channel = ?' : ''}
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.name, u.email, u.phone_number
      HAVING COUNT(t.id) > 0
      ORDER BY total_spent DESC
      `,
      report.channel !== ReportChannel.ALL
        ? [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate(), report.channel]
        : [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate()]
    )

    const customers = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone_number,
      total_transactions: Number(r.total_transactions),
      total_spent: Number(r.total_spent),
      avg_order_value: Number(r.total_transactions) > 0 ? Number(r.total_spent) / Number(r.total_transactions) : 0,
      last_transaction: r.last_transaction_date,
    }))

    const totalCustomers = customers.length
    const totalRevenue = customers.reduce((sum: number, c: any) => sum + c.total_spent, 0)
    const topCustomers = customers.slice(0, 10)

    return {
      data: {
        customers,
        top_customers: topCustomers,
      },
      summary: {
        total_customers: totalCustomers,
        total_revenue: totalRevenue,
        avg_customer_value: totalCustomers > 0 ? totalRevenue / totalCustomers : 0,
        period: `${report.startDate.toFormat('yyyy-MM-dd')} to ${report.endDate.toFormat('yyyy-MM-dd')}`,
      },
    }
  }

  /**
   * Generate Inventory Report
   */
  private async generateInventoryReport(report: Report) {
    const { rows } = await db.rawQuery(
      `
      SELECT 
        p.id,
        p.name,
        p.master_sku,
        p.base_price,
        COALESCE(SUM(pvs.stock), 0) as current_stock,
        COALESCE(SUM(td.qty), 0) as total_sold
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN product_variant_stocks pvs ON pvs.product_variant_id = pv.id
      LEFT JOIN transaction_details td ON td.product_id = p.id
      LEFT JOIN transactions t ON t.id = td.transaction_id 
        AND t.transaction_status = ?
        AND t.created_at BETWEEN ? AND ?
      WHERE p.deleted_at IS NULL
      GROUP BY p.id, p.name, p.master_sku, p.base_price
      ORDER BY current_stock ASC
      `,
      [TransactionStatus.COMPLETED, report.startDate.toJSDate(), report.endDate.toJSDate()]
    )

    const products = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      sku: r.master_sku,
      base_price: Number(r.base_price),
      current_stock: Number(r.current_stock),
      total_sold: Number(r.total_sold),
      stock_value: Number(r.current_stock) * Number(r.base_price),
    }))

    const totalStockValue = products.reduce((sum: number, p: any) => sum + p.stock_value, 0)
    const lowStockProducts = products.filter((p: any) => p.current_stock < 10)

    return {
      data: {
        products,
        low_stock_products: lowStockProducts,
      },
      summary: {
        total_products: products.length,
        total_stock_value: totalStockValue,
        low_stock_count: lowStockProducts.length,
        period: `${report.startDate.toFormat('yyyy-MM-dd')} to ${report.endDate.toFormat('yyyy-MM-dd')}`,
      },
    }
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: number): Promise<Report> {
    return await Report.query().where('id', reportId).preload('user').firstOrFail()
  }

  /**
   * Get reports list with pagination
   */
  async getReports(page: number = 1, limit: number = 20, filters?: any) {
    const query = Report.query().preload('user').orderBy('created_at', 'desc')

    if (filters?.userId) {
      query.where('user_id', filters.userId)
    }

    if (filters?.reportType) {
      query.where('report_type', filters.reportType)
    }

    if (filters?.status) {
      query.where('status', filters.status)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Delete report
   */
  async deleteReport(reportId: number): Promise<void> {
    const report = await Report.findOrFail(reportId)
    report.deletedAt = DateTime.now()
    await report.save()
  }
}
