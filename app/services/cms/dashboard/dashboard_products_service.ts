import db from '@adonisjs/lucid/services/db'
import { TransactionStatus } from '../../../enums/transaction_status.js'

export class DashboardProductsService {
  async topProductSell(limit = 5) {
    const rows = await db
      .from('transactions as t')
      .join('transaction_details as td', 't.id', 'td.transaction_id')
      .join('products as p', 'p.id', 'td.product_id')
      .where('t.transaction_status', TransactionStatus.COMPLETED)
      .groupBy('p.id', 'p.name', 'p.base_price')
      .select('p.id', 'p.name', 'p.base_price')
      .sum('td.qty as total')
      .orderBy('total', 'desc')
      .limit(limit)

    return rows.map((r: any) => ({
      total: Number(r.total || 0),
      id: Number(r.id),
      name: r.name,
      base_price: Number(r.base_price || 0),
    }))
  }

  async lessProductSell(limit = 5) {
    const { rows } = await db.rawQuery(
      `
      select
        p.id,
        p.name,
        coalesce(sum(td.qty), 0) as total
      from
        products p
      left join transaction_details td
        on td.product_id = p.id
      left join transactions t
        on t.id = td.transaction_id
        and t.transaction_status = ?
      group by
        p.id, p.name
      order by total asc
      limit ?
      `,
      [TransactionStatus.COMPLETED, limit]
    )

    return rows.map((r: any) => ({
      total: Number(r.total || 0),
      id: Number(r.id),
      name: r.name,
    }))
  }
}
