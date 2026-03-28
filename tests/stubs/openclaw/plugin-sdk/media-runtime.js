export function fillPixel(buf, x, y, width, r, g, b, a) {
  const index = (y * width + x) * 4;
  buf[index] = r;
  buf[index + 1] = g;
  buf[index + 2] = b;
  buf[index + 3] = a;
}

export function encodePngRgba(_buf, _width, _height) {
  return Buffer.from("stub-png");
}

