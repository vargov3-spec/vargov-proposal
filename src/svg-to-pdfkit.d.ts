declare module "svg-to-pdfkit" {
  interface SVGtoPDFOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    assumePt?: boolean;
    useCSS?: boolean;
    [key: string]: unknown;
  }
  function SVGtoPDF(
    doc: unknown,
    svg: string,
    x?: number,
    y?: number,
    options?: SVGtoPDFOptions,
  ): void;
  export default SVGtoPDF;
}
