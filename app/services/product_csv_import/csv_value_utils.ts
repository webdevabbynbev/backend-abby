import * as slugifyLib from 'slugify'


export function slugify(text: string): string {
  const fn: any = (slugifyLib as any).default ?? slugifyLib
  return fn(String(text || '').trim(), { lower: true, strict: true })
}

export function normalizeValue(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  if (!s) return ''
  const low = s.toLowerCase()
  if (low === 'null' || low === 'undefined' || low === 'nan') return ''
  return s
}

export function pickValue(row: any, keys: string[]): string {
  for (const k of keys) {
    const v = row?.[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

export function parseMoneyRp(v: string): number {
  const s = String(v || '')
  const digits = s.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : 0
}

export function splitList(v: string): string[] {
  const s = String(v || '').trim()
  if (!s) return []
  const sep = s.includes('|') ? '|' : s.includes(';') ? ';' : ','
  return s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function mapStatus(v: string): string {
  const s = String(v || '').trim().toLowerCase()
  if (!s) return 'normal'
  if (s.includes('draft')) return 'draft'
  if (s.includes('war')) return 'war'
  if (s.includes('normal') || s.includes('aktif') || s.includes('active')) return 'normal'
  return 'normal'
}
