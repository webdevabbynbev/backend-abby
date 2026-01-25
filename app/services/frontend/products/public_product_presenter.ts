function toNumber(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function computeDiscountAmount(extraDiscount: any, eligiblePrice: number) {
  if (!extraDiscount) return 0
  const valueType = toNumber(extraDiscount.valueType, 0)
  const value = toNumber(extraDiscount.value, 0)
  const maxDiscount = extraDiscount.maxDiscount === null || extraDiscount.maxDiscount === undefined
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

      ? new Set<number>(extra.eligibleVariantIds.map((x: any) => toNumber(x, 0)).filter((x: number) => x > 0))

      : null



  return variants.map((v: any) => {

    const medias = Array.isArray(v?.medias) ? v.medias : []

    const images = medias.map((m: any) => m?.url).filter(Boolean)



    const price = toNumber(v?.price, 0)



    // determine eligibility

    const isEligible =

      !extra

        ? false

        : appliesTo === 3

          ? !!eligibleSet && eligibleSet.has(toNumber(v?.id, 0))

          : true



    const discAmount = isEligible ? computeDiscountAmount(extra, price) : 0

    const finalPrice = Math.max(0, price - discAmount)



    return {

      id: v.id,

      label: buildVariantLabel(v),

      sku: v.sku,

      attributes: v.attributes,

      price,

      finalPrice,



      isDiscounted: !!extra && isEligible && discAmount > 0,

      discountLabel: !!extra && isEligible && discAmount > 0 ? String(extra.label || '').trim() : null,

      discountAmount: discAmount,



      stock: toNumber(v.stock, 0),

      images,

      image: images[0] || productJson?.image,

    }

  })

}