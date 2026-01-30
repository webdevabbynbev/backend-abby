import type { HttpContext } from '@adonisjs/core/http'
import StockMovement from '#models/stock_movement'
import ProductVariant from '#models/product_variant'
import emitter from '@adonisjs/core/services/emitter'
import ExcelJS from 'exceljs'
import { SecurityUtils } from '#utils/security'

type MovementType = 'adjustment' | 'transfer_in' | 'transfer_out'

function pickMovementType(request: HttpContext['request']): MovementType {
  const raw = String(
    request.input('movement_type') ??
      request.input('movementType') ??
      request.input('type') ??
      'adjustment'
  ).toLowerCase()

  if (raw === 'transfer_in') return 'transfer_in'
  if (raw === 'transfer_out') return 'transfer_out'
  return 'adjustment'
}

function buildNote({
  baseNote,
  movementType,
  fromLocation,
  toLocation,
  supplierName,
  sentByRole,
  sentByName,
}: {
  baseNote: string
  movementType: MovementType
  fromLocation?: string
  toLocation?: string
  supplierName?: string
  sentByRole?: string
  sentByName?: string
}) {
  const parts: string[] = []
  if (baseNote?.trim()) parts.push(baseNote.trim())

  // ini biar FE bisa baca transfer_in/out walaupun type DB masih adjustment (legacy)
  parts.push(movementType)

  if (fromLocation) parts.push(`From: ${fromLocation}`)
  if (toLocation) parts.push(`To: ${toLocation}`)

  if (supplierName) parts.push(`Supplier: ${supplierName}`)

  if (sentByRole) parts.push(`sent_by_role:${sentByRole}`)
  if (sentByName) parts.push(`sent_by_name:${sentByName}`)

  return parts.filter(Boolean).join(' | ')
}

export default class StockMovementsController {
  public async get({ response, request, auth }: HttpContext) {
    try {
      const page = Math.max(1, SecurityUtils.safeNumber(request.input('page', 1), 1))
      const perPage = Math.min(
        100,
        Math.max(1, SecurityUtils.safeNumber(request.input('per_page', 20), 20))
      )

      const productId = request.input('product_id')
      const variantId = request.input('variant_id')
      const type = request.input('type') // bisa transfer_in / transfer_out / adjustment
      const dateFrom = request.input('date_from')
      const dateTo = request.input('date_to')

      const query = StockMovement.query()
        .preload('variant', (q) => q.preload('product'))
        .orderBy('created_at', 'desc')

      if (variantId) query.where('product_variant_id', variantId)
      if (productId) query.whereHas('variant', (q) => q.where('product_id', productId))

      // ✅ support filter type (baru + legacy)
      if (type) {
        const t = String(type).toLowerCase()
        if (t === 'transfer_in' || t === 'transfer_out') {
          query.where((q) => {
            q.where('type', t)
            // legacy: type masih adjustment tapi note ada transfer_in/out
            q.orWhereRaw('LOWER(note) LIKE ?', [`%${t}%`])
          })
        } else {
          query.where('type', t)
        }
      }

      if (dateFrom) query.where('created_at', '>=', dateFrom + ' 00:00:00')
      if (dateTo) query.where('created_at', '<=', dateTo + ' 23:59:59')

      const logs = await query.paginate(page, perPage)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `View Stock Movements`,
        menu: 'Stock Movements',
        data: { productId, variantId, type, dateFrom, dateTo, page, perPage },
      })

      return response.ok({
        message: 'success',
        serve: logs,
      })
    } catch (error) {
      return response.status(500).send({ message: error.message || 'Internal Server Error' })
    }
  }

  public async adjust({ request, response, auth }: HttpContext) {
    try {
      const variantId = SecurityUtils.safeNumber(request.input('variant_id'), 0)
      const rawChange = SecurityUtils.safeNumber(request.input('change'), 0)

      const movementType = pickMovementType(request)

      const baseNote = String(request.input('note') || 'Manual movement').trim()

      // tambahan info dari kanan (opsional)
      const fromLocation = request.input('from_location') ?? request.input('fromLocation')
      const toLocation = request.input('to_location') ?? request.input('toLocation')

      // kalau pilih Supplier di FE, kirim supplier_name / supplierName
      const supplierName = request.input('supplier_name') ?? request.input('supplierName')

      if (variantId <= 0) {
        return response.status(422).send({ message: 'Invalid variant_id' })
      }

      if (!rawChange || Number.isNaN(rawChange)) {
        return response.status(422).send({ message: 'Change amount cannot be zero' })
      }

      const variant = await ProductVariant.find(variantId)
      if (!variant) {
        return response.status(404).send({ message: 'Variant not found' })
      }

      // ✅ enforce sign by type (biar gak bisa kebalik)
      const abs = Math.abs(rawChange)
      const change = movementType === 'transfer_out' ? -abs : abs

      const note = buildNote({
        baseNote,
        movementType,
        fromLocation,
        toLocation,
        supplierName,
        sentByRole: auth.user?.role_name,
        sentByName: auth.user?.name,
      })

      // ✅ type sekarang ikut movementType (buat list “Type” bener)
      // kalau adjustStock typing-nya ketat, pakai cast any biar gak merah TS
      await (variant as any).adjustStock(change, movementType, undefined, note)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Manual Stock Movement (${movementType})`,
        menu: 'Stock Movements',
        data: { variantId: variant.id, change, movementType, fromLocation, toLocation, supplierName, note },
      })

      return response.ok({ message: 'Stock movement saved successfully', serve: variant })
    } catch (error) {
      return response.status(500).send({ message: error.message || 'Internal Server Error' })
    }
  }

  // ✅ tombol "Terima"
  public async receive({ params, response, auth }: HttpContext) {
    try {
      const id = params.id
      const movement = await StockMovement.find(id)

      if (!movement) {
        return response.status(404).send({ message: 'Stock movement not found' })
      }

      const roleName = auth.user?.role_name ?? 'UNKNOWN'
      const userName = auth.user?.name ?? 'UNKNOWN'
      const stamp = new Date().toISOString()

      const currentNote = String(movement.note ?? '')
      const lower = currentNote.toLowerCase()
      const already = lower.includes('received_by_role:') || lower.includes('received_at:')

      if (!already) {
        movement.note = [currentNote, `received_by_role:${roleName}`, `received_by_name:${userName}`, `received_at:${stamp}`]
          .map((x) => String(x).trim())
          .filter(Boolean)
          .join(' | ')
        await movement.save()
      }

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName,
        userName,
        activity: `Receive Stock Movement`,
        menu: 'Stock Movements',
        data: { id, receivedByRole: roleName, receivedByName: userName, receivedAt: stamp },
      })

      return response.ok({ message: 'Stock movement received', serve: movement })
    } catch (error) {
      return response.status(500).send({ message: error.message || 'Internal Server Error' })
    }
  }

  // export boleh tetep (kalau nanti mau dipake lagi)
  public async export({ response, request, auth }: HttpContext) {
    try {
      const format = (request.input('format') || 'excel').toLowerCase()
      const productId = request.input('product_id')
      const variantId = request.input('variant_id')
      const type = request.input('type')
      const dateFrom = request.input('date_from')
      const dateTo = request.input('date_to')

      const query = StockMovement.query()
        .preload('variant', (q) => q.preload('product'))
        .orderBy('created_at', 'desc')

      if (variantId) query.where('product_variant_id', variantId)
      if (productId) query.whereHas('variant', (q) => q.where('product_id', productId))

      if (type) {
        const t = String(type).toLowerCase()
        if (t === 'transfer_in' || t === 'transfer_out') {
          query.where((q) => {
            q.where('type', t)
            q.orWhereRaw('LOWER(note) LIKE ?', [`%${t}%`])
          })
        } else {
          query.where('type', t)
        }
      }

      if (dateFrom) query.where('created_at', '>=', dateFrom + ' 00:00:00')
      if (dateTo) query.where('created_at', '<=', dateTo + ' 23:59:59')

      const logs = await query

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Export Stock Movements (${format.toUpperCase()})`,
        menu: 'Stock Movements',
        data: { productId, variantId, type, dateFrom, dateTo, format },
      })

      if (format === 'csv') {
        let csv = 'ID,Product,Variant SKU,Barcode,Change,Type,Note,Date\n'
        logs.forEach((log) => {
          csv +=
            [
              log.id,
              log.variant?.product?.name || '-',
              log.variant?.sku || '-',
              log.variant?.barcode || '-',
              log.change,
              log.type,
              `"${log.note || '-'}"`,
              log.createdAt.toFormat('yyyy-MM-dd HH:mm'),
            ].join(',') + '\n'
        })

        response.header('Content-Type', 'text/csv')
        response.header('Content-Disposition', `attachment; filename="stock_movements_${Date.now()}.csv"`)
        return response.send(csv)
      } else {
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('Stock Movements')

        worksheet.columns = [
          { header: 'ID', key: 'id', width: 10 },
          { header: 'Product', key: 'product', width: 30 },
          { header: 'Variant SKU', key: 'sku', width: 20 },
          { header: 'Barcode', key: 'barcode', width: 20 },
          { header: 'Change', key: 'change', width: 10 },
          { header: 'Type', key: 'type', width: 15 },
          { header: 'Note', key: 'note', width: 30 },
          { header: 'Date', key: 'date', width: 20 },
        ]

        logs.forEach((log) => {
          worksheet.addRow({
            id: log.id,
            product: log.variant?.product?.name || '-',
            sku: log.variant?.sku || '-',
            barcode: log.variant?.barcode || '-',
            change: log.change,
            type: log.type,
            note: log.note || '-',
            date: log.createdAt.toFormat('yyyy-MM-dd HH:mm'),
          })
        })

        response.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response.header('Content-Disposition', `attachment; filename="stock_movements_${Date.now()}.xlsx"`)
        await workbook.xlsx.write(response.response)
        return response.response
      }
    } catch (error) {
      return response.status(500).send({ message: error.message || 'Internal Server Error' })
    }
  }
}
