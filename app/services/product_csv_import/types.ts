export type ImportError = { row: number | string; name?: string; message: string }

export type MasterStats = {
  productCreated: number
  productUpdated: number
  variantCreated: number
  mediaCreated: number
  tagAttached: number
  concernAttached: number
  variantAttrAttached: number
  onlineCreated: number
}

export type MasterVariantRow = {
  variantName?: string
  sku1?: string
  sku2?: string
  stock?: number
  basePrice?: number
  price?: number
  photoVariant?: string
  __row?: number
  bpom?: string | null
  ingredients?: string | null
}

export type MasterGroup = {
  productName: string
  masterSku?: string
  brandName?: string
  parentCat?: string
  sub1?: string
  sub2?: string
  statusProduk?: string
  tags?: string
  concern?: string
  subConcern?: string
  photos?: string[]
  basePrice?: number
  variants?: MasterVariantRow[]
  howToUse?: string | null
}
