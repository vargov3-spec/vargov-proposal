export interface VideoLink {
  url: string;
  kind: "youtube" | "vimeo" | "rutube" | "other";
  id?: string;
  title?: string;
  thumbFile?: string;
}

export interface GalleryImage {
  url: string;
  file: string; // optimized local file
  width: number;
  height: number;
}

export interface ProductData {
  sku: string;
  title: string;
  url: string;
  categoryRu: string;
  descriptionRaw: string;
  gallery: string[];
  model3dUrl?: string;
  videos: VideoLink[];
  characteristics: { name: string; value: string }[];
  elementSizeFromSite?: string;
  source: "live" | "local-dataset";
}

export interface CommercialInput {
  sku: string;
  compositionSize?: string;
  elementSize?: string;
  elementCount?: string;
  price?: string;
  deliveryCost?: string;
  productionTime?: string;
  deliveryTime?: string;
  cargoVolume?: string;
  cargoWeight?: string;
}

export interface ProposalContext {
  product: ProductData;
  input: CommercialInput;
  images: GalleryImage[];
  hero: GalleryImage;
  totalLine?: string;
  /** Internal USD→RUB rate from vargov.ru (for showing ruble equivalents). */
  usdRub?: number;
  date: string;
}
