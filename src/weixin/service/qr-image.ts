import QRCodeModule from "qrcode-terminal/vendor/QRCode/index.js";
import QRErrorCorrectLevelModule from "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js";

type QRCodeConstructor = new (
  typeNumber: number,
  errorCorrectLevel: unknown,
) => {
  addData: (data: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

const QRCode = QRCodeModule as QRCodeConstructor;
const QRErrorCorrectLevel = QRErrorCorrectLevelModule;

type MediaRuntimeCompat = {
  encodePngRgba: (buf: Buffer, width: number, height: number) => Buffer;
  fillPixel: (
    buf: Buffer,
    x: number,
    y: number,
    width: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => void;
};

let mediaRuntimeCompat: MediaRuntimeCompat | null = null;
let mediaRuntimeLoadAttempted = false;

function renderSvgDataUrl(
  qr: InstanceType<QRCodeConstructor>,
  size: number,
  scale: number,
  marginModules: number,
): string {
  const modules = qr.getModuleCount();
  const rects: string[] = [];
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }
      const x = (col + marginModules) * scale;
      const y = (row + marginModules) * scale;
      rects.push(`<rect x="${x}" y="${y}" width="${scale}" height="${scale}" fill="#000"/>`);
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    rects.join("") +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isValidPng(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

async function loadMediaRuntimeCompat(): Promise<MediaRuntimeCompat | null> {
  if (!mediaRuntimeLoadAttempted) {
    mediaRuntimeLoadAttempted = true;
    try {
      const mod = await import("openclaw/plugin-sdk/media-runtime");
      mediaRuntimeCompat = {
        encodePngRgba: mod.encodePngRgba,
        fillPixel: mod.fillPixel,
      };
    } catch {
      mediaRuntimeCompat = null;
    }
  }
  return mediaRuntimeCompat;
}

export async function renderQrImageDataUrl(
  input: string,
  opts: { scale?: number; marginModules?: number } = {},
): Promise<string | undefined> {
  const { scale = 6, marginModules = 4 } = opts;
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(input);
  qr.make();

  const modules = qr.getModuleCount();
  const size = (modules + marginModules * 2) * scale;

  const mediaRuntime = await loadMediaRuntimeCompat();
  if (!mediaRuntime) {
    return renderSvgDataUrl(qr, size, scale, marginModules);
  }

  const buf = Buffer.alloc(size * size * 4, 255);

  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }
      const startX = (col + marginModules) * scale;
      const startY = (row + marginModules) * scale;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          mediaRuntime.fillPixel(buf, startX + x, startY + y, size, 0, 0, 0, 255);
        }
      }
    }
  }

  const png = mediaRuntime.encodePngRgba(buf, size, size);
  if (!isValidPng(png)) {
    return renderSvgDataUrl(qr, size, scale, marginModules);
  }
  return `data:image/png;base64,${png.toString("base64")}`;
}
