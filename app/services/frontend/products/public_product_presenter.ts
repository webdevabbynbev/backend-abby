function toNumber(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function computeDiscountAmount(extraDiscount: any, eligiblePrice: number) {
  if (!extraDiscount) return 0
  const valueType = toNumber(extraDiscount.valueType, 0)
  const value = toNumber(extraDiscount.value, 0)
  const maxDiscount =
    extraDiscount.maxDiscount === null || extraDiscount.maxDiscount === undefined
      ? null
      : toNumber(extraDiscount.maxDiscount, null as any)

  if (eligiblePrice <= 0) return 0

  // nominal
  if (valueType === 2) {
    return Math.max(0, Math.min(value, eligiblePrice))
  }

  // percentage
  const raw = (eligiblePrice * value) / 100
  const capped = maxDiscount !== null ? Math.min(raw, maxDiscount) : raw
  return Math.max(0, Math.min(capped, eligiblePrice))
}

function buildVariantLabel(variant: any): string {
  if (Array.isArray(variant?.attributes) && variant.attributes.length > 0) {
    // Sort attributes by their parent attribute's name/id to ensure consistent order
    const sortedAttributes = [...variant.attributes].sort((a, b) => {
      const nameA = a.attribute?.name?.toLowerCase() ?? ''
      const nameB = b.attribute?.name?.toLowerCase() ?? ''
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return 0
    })

    const parts = sortedAttributes.map((attr: any) => attr.value).filter(Boolean)
    if (parts.length > 0) {
      return parts.join(' / ')
    }
  }

  return variant.sku || `VAR-${variant.id}`
}

export function buildVariantItems(productJson: any) {
  const variants = Array.isArray(productJson?.variants) ? productJson.variants : []

  const extra = productJson?.extraDiscount || null
  const appliesTo = extra ? toNumber(extra.appliesTo, -1) : -1

  // ✅ kalau appliesTo=3, hanya eligibleVariantIds yang kena
  const eligibleSet =
    extra && appliesTo === 3 && Array.isArray(extra.eligibleVariantIds)
      ? new Set<number>(
          extra.eligibleVariantIds
            .map((x: any) => toNumber(x, 0))
            .filter((x: number) => x > 0)
        )
      : null

  return variants.map((v: any) => {
    const medias = Array.isArray(v?.medias) ? v.medias : []
    const images = medias.map((m: any) => m?.url).filter(Boolean)

    const price = toNumber(v?.price, 0)

    // ✅ promo per-variant dari sale/flash (datang dari API detail product)
    const salePrice = toNumber(v?.salePrice ?? v?.sale_price, 0)
    const flashPrice = toNumber(v?.flashPrice ?? v?.flash_price, 0)

    // prioritas SALE dulu, baru FLASH
    const promoPrice = salePrice > 0 ? salePrice : flashPrice > 0 ? flashPrice : 0
    const hasPromo = promoPrice > 0 && promoPrice < price
    const promoLabel = hasPromo ? (salePrice > 0 ? 'SALE' : 'FLASH') : null

    // determine eligibility extra discount
    const isEligible =
      !extra
        ? false
        : appliesTo === 3
          ? !!eligibleSet && eligibleSet.has(toNumber(v?.id, 0))
          : true

    // ✅ eligible price untuk extra discount:
    // kalau ada promo variant, diskon extra dihitung dari promoPrice (stacking)
    // kalau tidak ada promo variant, diskon extra dihitung dari price biasa
    const eligiblePriceForExtra = hasPromo ? promoPrice : price

    const discAmount = isEligible ? computeDiscountAmount(extra, eligiblePriceForExtra) : 0
    const finalPrice = Math.max(0, eligiblePriceForExtra - discAmount)

    // status discounted:
    // - true kalau ada promo variant (sale/flash)
    // - atau kalau ada extra discount yang benar-benar kepakai
    const isDiscounted = hasPromo || (!!extra && isEligible && discAmount > 0)

    // label:
    // - kalau ada promo, tampilkan SALE/FLASH
    // - kalau tidak ada promo, baru pakai label dari extra discount
    const discountLabel =
      hasPromo
        ? promoLabel
        : !!extra && isEligible && discAmount > 0
          ? String(extra.label || '').trim()
          : null

    // discountAmount:
    // - kalau ada promo: minimal tunjukkan pengurangan dari price -> promoPrice
    // - kalau stacking promo + extra: discountAmount total dari price -> finalPrice
    // - kalau hanya extra: price -> finalPrice
    let discountAmount = 0
    if (hasPromo) {
      discountAmount = Math.max(0, price - finalPrice)
    } else {
      discountAmount = discAmount
    }

    return {
      id: v.id,
      label: buildVariantLabel(v),
      sku: v.sku,
      attributes: v.attributes,

      price,
      finalPrice,

      // expose promo fields (biar FE gampang pakai kalau perlu)
      salePrice: salePrice > 0 ? salePrice : 0,
      flashPrice: flashPrice > 0 ? flashPrice : 0,

      isDiscounted,
      discountLabel: discountLabel || null,
      discountAmount,

      stock: toNumber(v.stock, 0),

      // optional: promo stock kalau FE butuh
      saleStock: toNumber(v?.saleStock ?? v?.sale_stock, 0),
      flashStock: toNumber(v?.flashStock ?? v?.flash_stock, 0),

      images,
      image: images[0] || productJson?.image,
    }
  })
}