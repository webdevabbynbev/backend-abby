import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import path from 'node:path'

const AWS_REGION = process.env.AWS_REGION
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET
const AWS_CLOUDFRONT_URL = process.env.AWS_CLOUDFRONT_URL
const APP_URL = process.env.APP_URL || 'http://localhost:3333'
const DRIVE_DISK = (process.env.DRIVE_DISK || 's3').toLowerCase()

const s3Client = AWS_REGION ? new S3Client({ region: AWS_REGION }) : null

function normalizeKey(key: string) {
  const normalized = String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!normalized) throw new Error('Invalid key')
  if (normalized.includes('..')) throw new Error('Invalid key')
  return normalized
}

async function writeLocalFile(key: string, body: Buffer | Readable) {
  const safeKey = normalizeKey(key)
  const outPath = path.join(process.cwd(), 'public', safeKey)
  await fs.mkdir(path.dirname(outPath), { recursive: true })

  if (Buffer.isBuffer(body)) {
    await fs.writeFile(outPath, body)
    return safeKey
  }

  // stream -> file
  const { createWriteStream } = await import('node:fs')
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(outPath)
    body.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
    body.on('error', reject)
  })

  return safeKey
}

export const uploadToS3 = async ({
  key,
  body,
  contentType,
}: {
  key: string
  body: Buffer | Readable
  contentType?: string
}) => {
  const safeKey = normalizeKey(key)

  // ✅ Local dev
  if (DRIVE_DISK === 'fs' || !AWS_S3_BUCKET || !s3Client) {
    return await writeLocalFile(safeKey, body)
  }

  const params = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: safeKey,
    Body: body,
    ContentType: contentType,
  })

  await s3Client.send(params)
  return safeKey
}

export const deleteFromStorage = async (keyOrUrl: string) => {
  if (!keyOrUrl) return

  let key = String(keyOrUrl)
  if (key.startsWith('http')) {
    // remove https://domain/
    key = key.replace(/^https?:\/\/[^/]+\//, '')
  }
  const safeKey = normalizeKey(key)

  if (DRIVE_DISK === 'fs' || !AWS_S3_BUCKET || !s3Client) {
    const filePath = path.join(process.cwd(), 'public', safeKey)
    await fs.unlink(filePath).catch(() => {})
    return
  }

  await s3Client
    .send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: safeKey }))
    .catch(() => {})
}

export function buildS3Url(fileName: string) {
  if (!fileName) return fileName
  if (fileName.startsWith('http')) return fileName

  const safeKey = normalizeKey(fileName)

  // ✅ Local dev
  if (DRIVE_DISK === 'fs' || !AWS_S3_BUCKET) {
    return `${APP_URL}/${safeKey}`
  }

  // ✅ CDN (CloudFront)
  if (AWS_CLOUDFRONT_URL) {
    const base = AWS_CLOUDFRONT_URL.startsWith('http')
      ? AWS_CLOUDFRONT_URL
      : `https://${AWS_CLOUDFRONT_URL}`
    return `${base}/${safeKey}`
  }

  // fallback: return key
  return safeKey
}
