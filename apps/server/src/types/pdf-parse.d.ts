declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string
    numpages: number
    numrender: number
    info: unknown
    metadata: unknown
    version: string
  }
  function pdfParse(dataBuffer: Buffer, options?: unknown): Promise<PdfParseResult>
  export default pdfParse
}
