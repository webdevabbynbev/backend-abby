import crypto from 'crypto'

export const generateSlug = async (value: string): Promise<string> => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export const stripFileExtension = (filename: any) => {
  return filename.substring(0, filename.lastIndexOf('.')) || filename
}

export const replaceUrlUnsafeCharacters = (filename: string) => {
  return filename.replace(/[&\/\\#+$~%'":*?<>{}/\s+]/g, '_')
}

export const isJSON = (text: string) => {
  return /^[\],:{}\s]*$/.test(
    text
      .replace(/\\["\\\/bfnrtu]/g, '@')
      .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
      .replace(/(?:^|:|,)(?:\s*\[)+/g, '')
  )
}

export const formatDate = (date: Date | string) => {
  return date
}

export const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString()
}
