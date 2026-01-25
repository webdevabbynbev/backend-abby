export function applyListPreloads(productQuery: any, nowStr: string, includeReviews = false) {
  productQuery
    .apply((scopes: any) => scopes.active())
    .withCount('reviews', (reviewQuery: any) => reviewQuery.as('review_count'))
    .withAggregate('reviews', (reviewQuery: any) => reviewQuery.avg('rating').as('avg_rating'))
    .preload('discounts', (query: any) =>
      query.where('start_date', '<=', nowStr).where('end_date', '>=', nowStr)
    )
    .preload('variants', (variantLoader: any) => {
      variantLoader
        .select(['id', 'price', 'stock', 'product_id'])
        .whereNull('product_variants.deleted_at')
        .preload('medias', (mq: any) => {
          mq.apply((scopes: any) => scopes.active())
          mq.orderBy('slot', 'asc')
        })
    })
    .preload('medias')
    .preload('categoryType')
    .preload('brand')
    .preload('persona')
    .preload('tags')
    .preload('concernOptions')
    .preload('profileOptions')

  if (includeReviews) {
    productQuery.preload('reviews', (reviewQuery: any) => {
      reviewQuery
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .preload('user', (userQuery: any) =>
          userQuery.select(['id', 'first_name', 'last_name', 'photo_profile'])
        )
    })
  }
}

export function applyDetailPreloads(productQuery: any, nowStr: string) {
  productQuery
    .apply((scopes: any) => scopes.active())
    .withCount('reviews', (reviewQuery: any) => reviewQuery.as('review_count'))
    .withAggregate('reviews', (reviewQuery: any) => reviewQuery.avg('rating').as('avg_rating'))
    .preload('reviews', (reviewQuery: any) => {
      reviewQuery
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .preload('user', (userQuery: any) =>
          userQuery.select(['id', 'first_name', 'last_name', 'photo_profile'])
        )
    })
    .preload('variants', (variantLoader: any) => {
      variantLoader
        .whereNull('product_variants.deleted_at')
        .preload('medias', (mq: any) => {
          mq.apply((scopes: any) => scopes.active())
          mq.orderBy('slot', 'asc')
        })
        .preload('attributes', (attributeLoader: any) => {
          attributeLoader
            .whereNull('attribute_values.deleted_at')
            .preload('attribute', (aq: any) => aq.whereNull('attributes.deleted_at'))
        })
    })
    .preload('discounts', (query: any) =>
      query.where('start_date', '<=', nowStr).where('end_date', '>=', nowStr)
    )
    .preload('medias')
    .preload('categoryType')
    .preload('brand')
    .preload('persona')
    .preload('tags')
    .preload('concernOptions')
    .preload('profileOptions')
}