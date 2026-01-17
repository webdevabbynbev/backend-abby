import TransactionCart from '#models/transaction_cart'

type SortDir = 'asc' | 'desc'
type SortType = 'ASC' | 'DESC'

type CartListOptions = {
  sortBy?: string
  sortType?: SortType
  isCheckout?: 0 | 1 | null
  page?: number
  perPage?: number
  includeVariantAttributes?: boolean
}

export class CartRepository {
  private sanitizeSort(sortBy?: string, sortType?: SortType): { field: string; dir: SortDir } {
    const allowedFields = new Set(['created_at', 'id', 'qty', 'amount', 'price'])
    const field = allowedFields.has(String(sortBy)) ? String(sortBy) : 'created_at'

    const dirRaw = String(sortType || 'DESC').toUpperCase()
    const dir: SortDir = dirRaw === 'ASC' ? 'asc' : 'desc'

    return { field, dir }
  }

  getTotalRaw(userId: number) {
    return TransactionCart.query().where('user_id', userId)
  }

  paginateForUser(userId: number, opts: CartListOptions) {
    const { field, dir } = this.sanitizeSort(opts.sortBy, opts.sortType)

    const page = Number.isFinite(opts.page as any) ? Number(opts.page) : 1
    const perPage = Number.isFinite(opts.perPage as any) ? Number(opts.perPage) : 10

    const isCheckout: 0 | 1 | null = typeof opts.isCheckout === 'number' ? opts.isCheckout : null
    const includeVariantAttributes = !!opts.includeVariantAttributes

    const q = TransactionCart.query().where('transaction_carts.user_id', userId)

    if (isCheckout !== null) {
      q.where('transaction_carts.is_checkout', isCheckout)
    }

    return q
      .preload('product', (query) => {
        query
          .preload('brand')
          .preload('categoryType')
          // ✅ cukup 1 media untuk thumbnail
          .preload('medias', (mq) => {
            mq.orderBy('slot', 'asc').limit(1)
          })
      })
      .preload('variant', (variantLoader) => {
        // ✅ attributes hanya kalau diminta (compat mode)
        if (includeVariantAttributes) {
          variantLoader.preload('attributes', (attributeLoader) => {
            attributeLoader.preload('attribute')
          })
        }
      })
      .orderBy(`transaction_carts.${field}`, dir)
      .paginate(page, perPage)
  }

  miniForUser(userId: number, limit = 10) {
    return TransactionCart.query()
      .where('user_id', userId)
      .preload('product', (q) =>
        q.preload('medias', (mq) => {
          mq.orderBy('slot', 'asc').limit(1)
        })
      )
      .preload('variant')
      .orderBy('created_at', 'desc')
      .limit(limit)
  }

  findExisting(trx: any, userId: number, productId: number, variantId: number) {
    return TransactionCart.query({ client: trx })
      .where('user_id', userId)
      .where('product_id', productId)
      .where('product_variant_id', variantId)
      .first()
  }

  findByIdForUser(trx: any, userId: number, cartId: number) {
    return TransactionCart.query({ client: trx })
      .where('id', cartId)
      .where('user_id', userId)
      .preload('variant')
      .first()
  }

  findByIdOnly(trx: any, userId: number, cartId: number) {
    return TransactionCart.query({ client: trx }).where('id', cartId).where('user_id', userId).first()
  }
}
