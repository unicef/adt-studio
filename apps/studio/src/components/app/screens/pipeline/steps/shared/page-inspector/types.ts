export interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PageSize {
  w: number
  h: number
}

export interface PageBox {
  imageId: string
  number: number
  bounds?: ImageBounds
}
