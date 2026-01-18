export function buildVariantItems(productJson: any) {
  const variants = Array.isArray(productJson?.variants) ? productJson.variants : []
  return variants.map((v: any) => {
    const medias = Array.isArray(v?.medias) ? v.medias : []
    const images = medias.map((m: any) => m?.url).filter(Boolean)

    return {
      id: v.id,
      label: v.sku || `VAR-${v.id}`,
      price: Number(v.price || 0),
      stock: Number(v.stock || 0),
      images,
      image: images[0] || productJson?.image,
    }
  })
}
