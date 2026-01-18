declare module 'swagger-ui-express' {
  const swaggerUi: {
    generateHTML: (swaggerDoc: unknown, options?: unknown) => string
    serve: unknown
    setup: (swaggerDoc: unknown, options?: unknown) => unknown
    serveFiles?: (swaggerDoc?: unknown, opts?: { swaggerOptions?: Record<string, unknown> }) => unknown
  }

  export default swaggerUi
}