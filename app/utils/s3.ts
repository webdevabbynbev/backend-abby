import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import env from '#start/env'
import fs from 'fs'
import path from 'path'
const region = env.get('AWS_REGION', '')
const bucket = env.get('AWS_S3_BUCKET', '')
const accessKeyId = env.get('AWS_ACCESS_KEY_ID', '')
const secretAccessKey = env.get('AWS_SECRET_ACCESS_KEY', '')
const publicBaseUrl = env.get('AWS_S3_PUBLIC_URL', '').trim()

const s3Client = new S3Client({
  region: region || undefined,
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
        }
      : undefined,
})

const resolveBaseUrl = () => {
  if (publicBaseUrl) return publicBaseUrl.replace(/\/$/, '')
  if (!bucket) return ''
  if (region) return `https://${bucket}.s3.${region}.amazonaws.com`
  return `https://${bucket}.s3.amazonaws.com`
}

export const buildS3Url = (key: string) => {
  if (!key) return key
  if (key.startsWith('http')) return key
  const baseUrl = resolveBaseUrl()
  const normalizedKey = key.replace(/^\/+/, '')
  if (!baseUrl) {
    if (normalizedKey.startsWith('uploads/')) return `/${normalizedKey}`
    return `/uploads/${normalizedKey}`
  }
  return `${baseUrl}/${normalizedKey}`
}

const folderMap: Record<string, string> = {
  banner: 'Banners',
  banners: 'Banners',
  brand: 'Brands',
  brands: 'Brands',
  avatar: 'Avatars',
  avatars: 'Avatars',
  product: 'Products',
  products: 'Products',
}

const brandFolderMap: Record<string, string> = {
  logo: 'Logos',
  logos: 'Logos',
  banner: 'Banners',
  banners: 'Banners',
}

export const normalizeS3Key = (key: string) => {
  if (!key) return key
  const trimmed = key.replace(/^\/+/, '')
  if (!trimmed) return trimmed
  const [first, second, ...rest] = trimmed.split('/')
  const mappedFirst = folderMap[first.toLowerCase()] ?? first
  if (mappedFirst === 'Brands' && second) {
    const mappedSecond = brandFolderMap[second.toLowerCase()] ?? second
    return [mappedFirst, mappedSecond, ...rest].join('/')
  }
  return [mappedFirst, second, ...rest].filter(Boolean).join('/')
}

export const uploadToS3 = async ({
  key,
  body,
  contentType,
}: {
  key: string
  body: Buffer
  contentType?: string
}) => {
  const s3Key = normalizeS3Key(key)

  if (!bucket) {
    const localKey = s3Key.replace(/^\/+/, '').replace(/^uploads\//, '')
    const localPath = path.join(process.cwd(), 'public', 'uploads', localKey)
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true })
    await fs.promises.writeFile(localPath, body)
    return buildS3Url(localKey)
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    })
  )

  return buildS3Url(s3Key)
}