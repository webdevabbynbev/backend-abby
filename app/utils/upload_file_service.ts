// app/utils/upload_file_service.ts
import env from '#start/env'
import fs from 'node:fs'
import path from 'node:path'

type UploadOpts = {
  folder?: string // contoh: "Products/123/variant-456"
  type?: string // optional type for compatibility with upload calls
}

type UploadExtra = {
  publicId?: string // contoh: "8993137695169.A-2" (tanpa ext)
}

function guessExt(file: any) {
  const ext1 = String(file?.extname || '').trim()
  if (ext1) return ext1.replace(/^\./, '').toLowerCase()

  const cn = String(file?.clientName || '')
  const ext2 = path.extname(cn).replace(/^\./, '').toLowerCase()
  return ext2 || 'png'
}

function sanitizeBaseName(name: string) {
  const base = path.basename(String(name || '')).trim()
  const safe = base.replace(/[^0-9A-Za-z._-]/g, '_').replace(/^\.+/, '')
  return safe || 'file'
}

async function readTmpToBuffer(file: any): Promise<Buffer> {
  const tmpPath = file?.tmpPath || file?.filePath || file?.path
  if (!tmpPath || typeof tmpPath !== 'string') {
    throw new Error('Upload file tidak punya tmpPath (cek bodyparser multipart autoProcess)')
  }
  return await fs.promises.readFile(tmpPath)
}

async function cleanupTmp(file: any) {
  const tmpPath = file?.tmpPath || file?.filePath || file?.path
  if (!tmpPath || typeof tmpPath !== 'string') return
  try {
    await fs.promises.unlink(tmpPath)
  } catch {
    // ignore
  }
}

function buildLocalUrl(relKey: string) {
  const k = relKey.replace(/^\/+/, '').replace(/^uploads\//, '')
  return `/uploads/${k}`
}

export default class FileUploadService {
  public static async uploadFile(file: any, opts: UploadOpts = {}, extra: UploadExtra = {}) {
    if (!file) throw new Error('No file provided')
    if (file?.isValid === false) {
      const msg = file?.errors?.[0]?.message || 'Invalid file'
      throw new Error(msg)
    }

    const driveDisk = String(env.get('DRIVE_DISK', 'fs') || '').toLowerCase()
    const forceLocal = driveDisk === 'fs' || driveDisk === 'local'
    if (!forceLocal) {
      // biar jelas aja: sekarang kamu minta lokal dulu
      throw new Error('DRIVE_DISK bukan fs/local. Set DRIVE_DISK=fs untuk mode lokal.')
    }

    const ext = guessExt(file)

    const folderBase = String(opts.folder || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
    const typeSegment = String(opts.type || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
    const folder = [folderBase, typeSegment].filter(Boolean).join('/')

    const publicIdRaw = extra?.publicId ? String(extra.publicId) : ''
    const baseName = publicIdRaw
      ? sanitizeBaseName(publicIdRaw)
      : sanitizeBaseName(String(file?.clientName || 'file'))

    const filename = baseName.toLowerCase().endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`

    const relKey = [folder, filename].filter(Boolean).join('/').replace(/\\/g, '/')

    const body = await readTmpToBuffer(file)

    try {
      // write ke public/uploads/<relKey>
      const uploadDir = path.join(process.cwd(), 'public', 'uploads')
      const safeParts = relKey
        .split('/')
        .map((p: string) => p.replace(/[^0-9A-Za-z._-]/g, '_').replace(/^\.+/, ''))
        .filter((p: string) => p.length > 0)

      if (safeParts.length === 0) throw new Error('Invalid upload path')

      const safeRel = safeParts.join('/')
      const localPath = path.join(uploadDir, safeRel)

      const resolvedPath = path.resolve(localPath)
      const resolvedUploadDir = path.resolve(uploadDir)
      if (!resolvedPath.startsWith(resolvedUploadDir)) {
        throw new Error('Path traversal attempt detected')
      }

      await fs.promises.mkdir(path.dirname(localPath), { recursive: true })
      await fs.promises.writeFile(localPath, body)

      return buildLocalUrl(safeRel)
    } finally {
      // ✅ penting: biar tmp gak numpuk
      await cleanupTmp(file)
    }
  }
}
