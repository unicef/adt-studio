import jpeg from "jpeg-js"

export const png = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAAH0lEQVR4AV3BwREAMAiAMMr+O1ufHsmbxSEhISEh8QGPSwQIxMxWxQAAAABJRU5ErkJggg=="
export const jpg = jpeg.encode({ width: 4, height: 6, data: Buffer.alloc(4 * 6 * 4, 255) }).data.toString("base64")
