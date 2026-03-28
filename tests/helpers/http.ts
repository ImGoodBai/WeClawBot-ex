type MockRequestInit = {
  method: string;
  url: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  text: string;
  json: any;
};

export async function invokeHttpHandler(
  server: { handleRequest: (req: any, res: any) => Promise<void> },
  init: MockRequestInit,
): Promise<MockResponse> {
  const bodyChunks = init.body ? [Buffer.from(JSON.stringify(init.body), "utf8")] : [];
  const req = {
    method: init.method,
    url: init.url,
    headers: init.headers ?? {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of bodyChunks) {
        yield chunk;
      }
    },
  };

  const headers: Record<string, string> = {};
  let text = "";
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end(chunk?: string | Buffer) {
      if (chunk === undefined) {
        return;
      }
      text += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    },
  };

  await server.handleRequest(req, res);

  return {
    statusCode: res.statusCode,
    headers,
    text,
    json: text ? JSON.parse(text) : undefined,
  };
}
