import type { HttpContext } from '@adonisjs/core/http'
import { buildS3Url, uploadToS3 } from '#utils/s3'
import { storeImageLink } from '#utils/image_link_storage'
import { SecurityUtils } from '#utils/security'

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

interface FileValidationResult {
  isValid: boolean
  errors: string[]
}

export default class UploadsController {
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB instead of 500MB
  private readonly ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'gif', 'png', 'pdf', 'doc', 'docx', 'webp']
  private readonly DANGEROUS_EXTENSIONS = ['php', 'js', 'html', 'htm', 'asp', 'jsp', 'exe', 'bat', 'sh']
  
  private validateFileContent(filePath: string, originalName: string): FileValidationResult {
    const errors: string[] = []
    
    try {
      // Read first few bytes to check magic numbers
      const buffer = fs.readFileSync(filePath)
      const hex = buffer.slice(0, 10).toString('hex').toLowerCase()
      
      // Check for executable/script content in any file
      if (hex.includes('4d5a')) { // MZ header (executable)
        errors.push('Executable files not allowed')
      }
      
      // Check file content for PHP/script tags
      const content = buffer.slice(0, 1024).toString('utf8').toLowerCase()
      if (content.includes('<?php') || content.includes('<script') || content.includes('<%')) {
        errors.push('Script content detected in file')
      }
      
      // Validate image files have proper magic numbers
      const ext = path.extname(originalName).toLowerCase().slice(1)
      if (['jpg', 'jpeg'].includes(ext) && !hex.startsWith('ffd8ff')) {
        errors.push('Invalid JPEG file format')
      }
      if (ext === 'png' && !hex.startsWith('89504e47')) {
        errors.push('Invalid PNG file format')
      }
      
    } catch (error) {
      errors.push('Unable to validate file content')
    }
    
    return { isValid: errors.length === 0, errors }
  }
  
  private sanitizeFileName(fileName: string): string {
    // Remove dangerous characters and normalize
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace all unsafe chars
      .replace(/_{2,}/g, '_') // Replace multiple underscores
      .replace(/^[._-]+|[._-]+$/g, '') // Remove leading/trailing special chars
      .slice(0, 100) // Limit length
    
    if (!sanitized) {
      throw new Error('Invalid filename after sanitization')
    }
    
    return sanitized
  }
  public async upload({ response, request }: HttpContext) {
    try {
      const file = request.file('file')
      
      if (!file) {
        return response.status(400).send({
          message: 'No file uploaded.',
          serve: [],
        })
      }

      // Enhanced file validation
      const fileValidation = request.file('file', {
        size: this.MAX_FILE_SIZE,
        extnames: this.ALLOWED_EXTENSIONS,
      })

      if (!fileValidation?.isValid) {
        const errors = fileValidation?.errors || []
        return response.status(422).send({
          message: 'File validation failed.',
          serve: errors,
        })
      }
      
      // Check for dangerous extensions in filename
      const originalName = file.clientName || 'unknown'
      const fileExt = path.extname(originalName).toLowerCase().slice(1)
      
      if (this.DANGEROUS_EXTENSIONS.includes(fileExt)) {
        return response.status(422).send({
          message: 'File type not allowed.',
          serve: [],
        })
      }
      
      // Validate file content
      const tmpPath = file.tmpPath
      if (!tmpPath) {
        return response.status(422).send({
          message: 'Upload processing failed.',
          serve: [],
        })
      }
      
      const contentValidation = this.validateFileContent(tmpPath, originalName)
      if (!contentValidation.isValid) {
        return response.status(422).send({
          message: 'File content validation failed.',
          serve: contentValidation.errors,
        })
      }

      // Secure filename generation
      const sanitizedFileName = this.sanitizeFileName(originalName)
      const timestamp = Date.now()
      const randomHash = crypto.randomBytes(8).toString('hex')
      const newFileName = `${timestamp}_${randomHash}_${sanitizedFileName}`

      const uploadedKey = await uploadToS3({
        key: `uploads/${newFileName}`,
        body: await fs.promises.readFile(tmpPath),
        contentType: file.headers['content-type'],
      })
     
      const uploadedUrl = buildS3Url(uploadedKey)

      await storeImageLink(uploadedUrl)
      
      return response.status(200).send({
        message: 'File uploaded successfully.',
        serve: uploadedUrl,
        signedUrl: uploadedUrl,
      })
    } catch (error: any) {
      // Don't expose internal error details
      console.error('Upload error:', error)
      return response.status(500).send({
        message: 'Upload failed. Please try again.',
        serve: [],
      })
    }
  }
}
