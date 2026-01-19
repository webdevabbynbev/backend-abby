function toNumber(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function isDeleted(row: any) {
  return !!row?.deletedAt || !!row?.deleted_at
}

export function buildVariantItems(productJson: any) {
  const variants = Array.isArray(productJson?.variants) ? productJson.variants : []

  // extraDiscount dari DiscountPricingService.attachExtraDiscount()
  const extra = productJson?.extraDiscount ?? null

  // kalau appliesTo=3 (variant-based), eligible range bisa subset.
  // Tapi kita tetap apply "display discount" ke setiap variant yang eligible:
  // - untuk legacy target_type=2 kita nggak punya list eligible IDs di payload, cuma punya range
  // - jadi safest: apply ke semua variant yang ada dalam eligible range min/max.
  const eligibleMin = extra ? toNumber(extra.eligibleMinPrice, 0) : 0
  const eligibleMax = extra ? toNumber(extra.eligibleMaxPrice, 0) : 0

  // helper hitung potongan per harga (cuma buat display)
  const computeDiscountAmount = (info: any, price: number) => {
    if (!info || price <= 0) return 0

    const valueType = toNumber(info.valueType, 0) // 1 pct, 2 nominal
    const value = toNumber(info.value, 0)
    const maxDiscount =
      info.maxDiscount === null || info.maxDiscount === undefined ? null : toNumber(info.maxDiscount, 0)

    if (valueType === 2) {
      return Math.max(0, Math.min(value, price))
    }

    // percentage
    const raw = (price * value) / 100
    const capped = maxDiscount !== null ? Math.min(raw, maxDiscount) : raw
    return Math.max(0, Math.min(capped, price))
  }

  const isVariantEligibleByRange = (price: number) => {
    if (!extra) return false
    // kalau range 0/0 berarti gak valid
    if (eligibleMin <= 0 && eligibleMax <= 0) return true // storewide / brand / product: treat eligible
    // normal case
    return price >= eligibleMin && price <= eligibleMax
  }

  return variants
    .filter((v: any) => !isDeleted(v))
    .map((v: any) => {
      const medias = Array.isArray(v?.medias) ? v.medias : []
      const images = medias.map((m: any) => m?.url).filter(Boolean)

      const basePrice = toNumber(v.price, 0)

      // default (no discount)
      let finalPrice = basePrice
      let discountLabel: string | null = null
      let discountInfo: any = null

      // apply display discount if exists
      if (extra) {
        // eligible check:
        // - appliesTo=3 => variant scope -> pakai range filter supaya nggak misleading
        // - lainnya => boleh apply ke semua varian
        const appliesTo = toNumber(extra.appliesTo, 0)
        const eligible =
          appliesTo === 3 ? isVariantEligibleByRange(basePrice) : true

        if (eligible) {
          const discAmt = computeDiscountAmount(extra, basePrice)
          const tmpFinal = Math.max(0, basePrice - discAmt)

          if (discAmt > 0 && tmpFinal < basePrice) {
            finalPrice = tmpFinal
            discountLabel = String(extra.label || '').trim() || null
            discountInfo = {
              discount_id: extra.discountId,
              label: discountLabel,
              value_type: extra.valueType,
              value: extra.value,
              max_discount: extra.maxDiscount,
              applies_to: extra.appliesTo,
              eligible_min_price: extra.eligibleMinPrice,
              eligible_max_price: extra.eligibleMaxPrice,
              final_price: finalPrice,
              discount_amount: discAmt,
            }
          }
        }
      }

      return {
        id: v.id,
        label: v.sku || `VAR-${v.id}`,

        // ✅ PRICE YANG DIPAKAI UI
        price: finalPrice,

        // ✅ tambahan untuk UI badge / strike-through
        originalPrice: basePrice,
        finalPrice,
        discountLabel,
        discountInfo,

        stock: toNumber(v.stock, 0),
        images,
        image: images[0] || productJson?.image,
      }
    })
}