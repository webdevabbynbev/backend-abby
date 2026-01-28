import type { HttpContext } from '@adonisjs/core/http'
import { ReportService } from '#services/cms/reports/report_service'
import { DateTime } from 'luxon'
import { ReportType, ReportPeriod, ReportFormat, ReportChannel } from '#enums/report_types'

export default class ReportsController {
  private reportService = new ReportService()

  /**
   * Get all reports with pagination
   * GET /api/v1/admin/reports
   */
  async index({ request, response, auth }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)
      const reportType = request.input('report_type')
      const status = request.input('status')

      const filters: any = {}
      
      // Non-admin users can only see their own reports
      const user = auth.user
      if (user && user.role !== 1) { // Assuming 1 is admin role
        filters.userId = user.id
      }

      if (reportType) {
        filters.reportType = reportType
      }

      if (status) {
        filters.status = status
      }

      const reports = await this.reportService.getReports(page, limit, filters)

      return response.status(200).send({
        message: 'Success',
        serve: reports,
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Get single report by ID
   * GET /api/v1/admin/reports/:id
   */
  async show({ params, response, auth }: HttpContext) {
    try {
      const report = await this.reportService.getReport(params.id)

      // Check authorization
      const user = auth.user
      if (user && user.role !== 1 && report.userId !== user.id) {
        return response.status(403).send({
          message: 'Forbidden: You can only view your own reports',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'Success',
        serve: report,
      })
    } catch (error: any) {
      return response.status(404).send({
        message: error?.message || 'Report not found',
        serve: null,
      })
    }
  }

  /**
   * Create new report
   * POST /api/v1/admin/reports
   */
  async store({ request, response, auth }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null,
        })
      }

      const {
        title,
        description,
        report_type,
        report_period,
        report_format,
        start_date,
        end_date,
        channel,
        filters,
      } = request.only([
        'title',
        'description',
        'report_type',
        'report_period',
        'report_format',
        'start_date',
        'end_date',
        'channel',
        'filters',
      ])

      // Validate required fields
      if (!title || !report_type || !report_period || !report_format || !start_date || !end_date) {
        return response.status(400).send({
          message: 'Missing required fields',
          serve: null,
        })
      }

      // Validate enum values
      if (!Object.values(ReportType).includes(report_type)) {
        return response.status(400).send({
          message: 'Invalid report type. Valid types: sales, sales_product, transaction, revenue, customer, inventory',
          serve: null,
        })
      }

      if (!Object.values(ReportPeriod).includes(report_period)) {
        return response.status(400).send({
          message: 'Invalid report period',
          serve: null,
        })
      }

      if (!Object.values(ReportFormat).includes(report_format)) {
        return response.status(400).send({
          message: 'Invalid report format',
          serve: null,
        })
      }

      const report = await this.reportService.createReport({
        title,
        description,
        reportType: report_type,
        reportPeriod: report_period,
        reportFormat: report_format,
        startDate: DateTime.fromISO(start_date),
        endDate: DateTime.fromISO(end_date),
        channel: channel || ReportChannel.ALL,
        filters: filters || {},
        userId: user.id,
      })

      return response.status(201).send({
        message: 'Report created successfully. Processing in background.',
        serve: report,
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Delete report
   * DELETE /api/v1/admin/reports/:id
   */
  async destroy({ params, response, auth }: HttpContext) {
    try {
      const report = await this.reportService.getReport(params.id)

      // Check authorization
      const user = auth.user
      if (user && user.role !== 1 && report.userId !== user.id) {
        return response.status(403).send({
          message: 'Forbidden: You can only delete your own reports',
          serve: null,
        })
      }

      await this.reportService.deleteReport(params.id)

      return response.status(200).send({
        message: 'Report deleted successfully',
        serve: null,
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Get report types (for dropdown)
   * GET /api/v1/admin/reports/types
   */
  async types({ response }: HttpContext) {
    return response.status(200).send({
      message: 'Success',
      serve: {
        report_types: Object.values(ReportType),
        report_periods: Object.values(ReportPeriod),
        report_formats: Object.values(ReportFormat),
        channels: Object.values(ReportChannel),
      },
    })
  }

  /**
   * Download report file
   * GET /api/v1/admin/reports/:id/download
   */
  async download({ params, response, auth }: HttpContext) {
    try {
      const report = await this.reportService.getReport(params.id)

      // Check authorization
      const user = auth.user
      if (user && user.role !== 1 && report.userId !== user.id) {
        return response.status(403).send({
          message: 'Forbidden: You can only download your own reports',
          serve: null,
        })
      }

      if (!report.isCompleted()) {
        return response.status(400).send({
          message: 'Report is not ready yet',
          serve: null,
        })
      }

      // Return the report data as downloadable file
      return response.status(200).send({
        message: 'Success',
        serve: {
          report_number: report.reportNumber,
          title: report.title,
          data: report.data,
          summary: report.summary,
          generated_at: report.generatedAt,
        },
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Get report summary/statistics
   * GET /api/v1/admin/reports/summary
   */
  async summary({ response, auth }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null,
        })
      }

      const filters: any = {}
      if (user.role !== 1) {
        filters.userId = user.id
      }

      const reports = await this.reportService.getReports(1, 1000, filters)

      const summary = {
        total_reports: reports.length,
        completed: reports.filter((r: any) => r.status === 'completed').length,
        pending: reports.filter((r: any) => r.status === 'pending').length,
        processing: reports.filter((r: any) => r.status === 'processing').length,
        failed: reports.filter((r: any) => r.status === 'failed').length,
      }

      return response.status(200).send({
        message: 'Success',
        serve: summary,
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
