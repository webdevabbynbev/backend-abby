# API Laporan - Dokumentasi & Contoh Penggunaan

## Overview
API Laporan menyediakan 6 jenis laporan yang dapat diakses dengan berbagai filter dan periode.

---

## Endpoints

### 1. Get Report Types
**GET** `/api/v1/admin/reports/types`

Mendapatkan daftar tipe laporan yang tersedia.

**Response:**
```json
{
  "message": "Success",
  "serve": {
    "report_types": ["sales", "sales_product", "transaction", "revenue", "customer", "inventory"],
    "report_periods": ["daily", "weekly", "monthly", "yearly", "custom"],
    "report_formats": ["pdf", "excel", "csv", "json"],
    "channels": ["all", "ecommerce", "pos"]
  }
}
```

---

## Jenis Laporan

### 2A. Laporan Penjualan (Sales Report)
**POST** `/api/v1/admin/reports`

Laporan penjualan dengan breakdown berdasarkan periode (harian, mingguan, bulanan, tahunan).

**Request Body - Harian:**
```json
{
  "title": "Laporan Penjualan Harian Januari 2026",
  "description": "Laporan penjualan per hari untuk bulan Januari",
  "report_type": "sales",
  "report_period": "daily",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "all"
}
```

**Request Body - Mingguan:**
```json
{
  "title": "Laporan Penjualan Mingguan Q1 2026",
  "description": "Laporan penjualan per minggu untuk Q1",
  "report_type": "sales",
  "report_period": "weekly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-03-31",
  "channel": "ecommerce"
}
```

**Request Body - Bulanan:**
```json
{
  "title": "Laporan Penjualan Bulanan 2026",
  "description": "Laporan penjualan per bulan untuk tahun 2026",
  "report_type": "sales",
  "report_period": "monthly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-12-31",
  "channel": "all"
}
```

**Request Body - Tahunan:**
```json
{
  "title": "Laporan Penjualan Tahunan",
  "description": "Laporan penjualan per tahun",
  "report_type": "sales",
  "report_period": "yearly",
  "report_format": "json",
  "start_date": "2023-01-01",
  "end_date": "2026-12-31",
  "channel": "all"
}
```

**Response Structure:**
```json
{
  "message": "Report created successfully. Processing in background.",
  "serve": {
    "id": 1,
    "report_number": "RPT-20260128-0001",
    "title": "Laporan Penjualan Harian Januari 2026",
    "status": "pending",
    "report_type": "sales",
    "report_period": "daily"
  }
}
```

**Data yang dihasilkan:**
- Transaksi lengkap dengan detail customer
- Grouped by period (daily/weekly/monthly/yearly)
- Total revenue, discount, items sold per period
- Summary: total transaksi, revenue, discount, avg order value

---

### 2B. Laporan Penjualan Produk (Sales Product Report)
**POST** `/api/v1/admin/reports`

Laporan penjualan per produk dengan filter per brand dan per variant.

**Request Body - Semua Produk:**
```json
{
  "title": "Laporan Penjualan Produk Januari 2026",
  "description": "Laporan penjualan semua produk",
  "report_type": "sales_product",
  "report_period": "monthly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "all",
  "filters": {}
}
```

**Request Body - Filter Per Brand:**
```json
{
  "title": "Laporan Penjualan Brand Tertentu",
  "description": "Laporan penjualan produk brand A dan B",
  "report_type": "sales_product",
  "report_period": "monthly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "all",
  "filters": {
    "brandIds": [1, 2]
  }
}
```

**Request Body - Filter Per Produk:**
```json
{
  "title": "Laporan Penjualan Produk Spesifik",
  "description": "Laporan penjualan produk ID 10, 20, 30",
  "report_type": "sales_product",
  "report_period": "custom",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "ecommerce",
  "filters": {
    "productIds": [10, 20, 30]
  }
}
```

**Request Body - Filter Per Variant:**
```json
{
  "title": "Laporan Penjualan Variant Tertentu",
  "description": "Laporan penjualan variant spesifik",
  "report_type": "sales_product",
  "report_period": "daily",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "all",
  "filters": {
    "variantIds": [100, 101, 102]
  }
}
```

**Request Body - Kombinasi Filter:**
```json
{
  "title": "Laporan Produk Brand X Variant Tertentu",
  "description": "Filter kombinasi brand dan variant",
  "report_type": "sales_product",
  "report_period": "weekly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "pos",
  "filters": {
    "brandIds": [1],
    "variantIds": [100, 101]
  }
}
```

**Data yang dihasilkan:**
- List produk dengan total penjualan, revenue, avg selling price
- List variant dengan detail attributes dan penjualan
- Top 10 produk terlaris
- Top 10 variant terlaris
- Sales breakdown per brand
- Summary: total produk, variant, revenue, items sold

---

### 2C. Laporan Transaksi (Transaction Report)
**POST** `/api/v1/admin/reports`

Laporan detail per transaksi dengan informasi lengkap customer, items, payment, shipping.

**Request Body - Semua Transaksi:**
```json
{
  "title": "Laporan Transaksi Januari 2026",
  "description": "Laporan detail semua transaksi",
  "report_type": "transaction",
  "report_period": "custom",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "all"
}
```

**Request Body - Filter Status:**
```json
{
  "title": "Laporan Transaksi Completed",
  "description": "Laporan transaksi yang sudah selesai",
  "report_type": "transaction",
  "report_period": "monthly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "all",
  "filters": {
    "status": 4
  }
}
```

**Request Body - Filter Channel:**
```json
{
  "title": "Laporan Transaksi E-commerce",
  "description": "Laporan transaksi dari channel ecommerce saja",
  "report_type": "transaction",
  "report_period": "daily",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "ecommerce"
}
```

**Request Body - Transaksi POS:**
```json
{
  "title": "Laporan Transaksi POS",
  "description": "Laporan transaksi dari offline store",
  "report_type": "transaction",
  "report_period": "weekly",
  "report_format": "json",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "channel": "pos"
}
```

**Data yang dihasilkan:**
- Detailed transactions dengan:
  - Customer info (name, email, phone)
  - Status dan label
  - Items lengkap (product, brand, variant, qty, price)
  - Ecommerce data (payment method, shipping, address)
  - POS data (cashier, cash received, change)
- Status breakdown
- Channel breakdown
- Payment method breakdown
- Summary: total transaksi, amount, discount, avg value

---

## Status Codes
- `1` - Waiting Payment
- `2` - On Process
- `3` - On Delivery
- `4` - Completed
- `9` - Failed/Cancelled

---

## Get Report Status & Download

### Check Report Status
**GET** `/api/v1/admin/reports/{report_id}`

```bash
GET /api/v1/admin/reports/1
```

**Response:**
```json
{
  "message": "Success",
  "serve": {
    "id": 1,
    "report_number": "RPT-20260128-0001",
    "title": "Laporan Penjualan Harian Januari 2026",
    "status": "completed",
    "generated_at": "2026-01-28T10:30:00.000Z",
    "report_type": "sales",
    "report_period": "daily"
  }
}
```

### Download Report
**GET** `/api/v1/admin/reports/{report_id}/download`

```bash
GET /api/v1/admin/reports/1/download
```

**Response:**
```json
{
  "message": "Success",
  "serve": {
    "report_number": "RPT-20260128-0001",
    "title": "Laporan Penjualan Harian Januari 2026",
    "data": { ... },
    "summary": { ... },
    "generated_at": "2026-01-28T10:30:00.000Z"
  }
}
```

---

## Get List Reports
**GET** `/api/v1/admin/reports?page=1&limit=20&report_type=sales&status=completed`

Query params:
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 20
- `report_type` (optional): Filter by type
- `status` (optional): Filter by status (pending, processing, completed, failed)

---

## Summary Statistics
**GET** `/api/v1/admin/reports/summary`

```json
{
  "message": "Success",
  "serve": {
    "total_reports": 50,
    "completed": 45,
    "pending": 2,
    "processing": 1,
    "failed": 2
  }
}
```

---

## Delete Report
**DELETE** `/api/v1/admin/reports/{report_id}`

---

## Tips Penggunaan

1. **Laporan Penjualan (sales)**
   - Gunakan untuk analisis penjualan berdasarkan waktu
   - Pilih period sesuai kebutuhan (daily/weekly/monthly/yearly)
   - Best untuk dashboard dan trend analysis

2. **Laporan Penjualan Produk (sales_product)**
   - Gunakan untuk analisis performa produk/variant
   - Filter per brand untuk analisis brand performance
   - Filter per variant untuk SKU analysis
   - Best untuk inventory planning dan product strategy

3. **Laporan Transaksi (transaction)**
   - Gunakan untuk audit dan reconciliation
   - Detail lengkap per transaksi
   - Termasuk shipping dan payment info
   - Best untuk customer service dan finance

4. **Background Processing**
   - Semua laporan diproses di background
   - Check status dengan GET /reports/{id}
   - Status: pending → processing → completed/failed
   - Download available saat status = completed

5. **Filters**
   - Kombinasi filter untuk laporan lebih spesifik
   - Channel filter untuk e-commerce vs POS analysis
   - Date range flexible dengan custom period
