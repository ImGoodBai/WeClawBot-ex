declare module "qrcode-terminal" {
  const qrcodeTerminal: {
    generate(
      text: string,
      options?: { small?: boolean },
      callback?: (qr: string) => void,
    ): void;
  };
  export default qrcodeTerminal;
}

declare module "qrcode-terminal/vendor/QRCode/index.js" {
  const QRCode: new (
    typeNumber: number,
    errorCorrectLevel: unknown,
  ) => {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  };
  export default QRCode;
}

declare module "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js" {
  const QRErrorCorrectLevel: {
    L: unknown;
    M: unknown;
    Q: unknown;
    H: unknown;
  };
  export default QRErrorCorrectLevel;
}

declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    setFfmpegPath(path: string): FfmpegCommand;
    seekInput(time: number): FfmpegCommand;
    frames(n: number): FfmpegCommand;
    outputOptions(opts: string[]): FfmpegCommand;
    output(path: string): FfmpegCommand;
    on(event: "end", cb: () => void): FfmpegCommand;
    on(event: "error", cb: (err: Error) => void): FfmpegCommand;
    run(): void;
  }
  function ffmpeg(input: string): FfmpegCommand;
  export default ffmpeg;
}

declare module "silk-wasm" {
  export function decode(
    input: Uint8Array,
    sampleRate: number,
  ): Promise<{ data: Uint8Array; duration: number }>;
}
