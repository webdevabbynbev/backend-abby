export default class ProductCsvSchemaDetector {
  isMasterSchema(keys: string[]): boolean {
    return keys.includes('nama produk') && keys.includes('nama varian') && keys.includes('sku master')
  }
}
