declare module 'adonis-autoswagger' {
  export interface SwaggerInfo {
    title?: string
    version?: string
    description?: string
  }

  export interface SwaggerOptions {
    info?: SwaggerInfo
    [key: string]: unknown
  }

  export const docs: (routes: unknown, options?: SwaggerOptions) => unknown
  export const ui: (path: string, options?: SwaggerOptions) => unknown

  const AutoSwagger: {
    docs: (routes: unknown, options?: SwaggerOptions) => unknown
    ui: (path: string, options?: SwaggerOptions) => unknown
  }

  export { AutoSwagger }
  export default AutoSwagger
}