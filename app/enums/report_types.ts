export enum ReportType {
  SALES = 'sales',
  SALES_PRODUCT = 'sales_product',
  TRANSACTION = 'transaction',
  REVENUE = 'revenue',
  CUSTOMER = 'customer',
  INVENTORY = 'inventory',
}

export enum ReportPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
}

export enum ReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
  JSON = 'json',
}

export enum ReportChannel {
  ALL = 'all',
  ECOMMERCE = 'ecommerce',
  POS = 'pos',
}
