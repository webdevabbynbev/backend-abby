declare module 'swagger-ui-express' {
  const swaggerUi: {
    generateHTML: (swaggerDoc: unknown) => string
    serve: unknown
    setup: (swaggerDoc: unknown) => unknown
  }

  export default swaggerUi
}