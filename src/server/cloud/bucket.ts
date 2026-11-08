import { get, put, list, del } from "@vercel/blob";
export interface PrivateObject {
  size: number;
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}
export interface PrivateBucket {
  get(key: string): Promise<PrivateObject | null>;
  put(
    key: string,
    data: string | Uint8Array,
    options?: { httpMetadata?: { contentType: string } },
  ): Promise<unknown>;
  list(options: {
    prefix: string;
  }): Promise<{ objects: { key: string; size: number }[] }>;
  delete(keys: string | string[]): Promise<void>;
}
export class BlobBucket implements PrivateBucket {
  async get(key: string) {
    const object = await get(key, { access: "private", useCache: false });
    if (!object || object.statusCode !== 200) return null;
    const response = new Response(object.stream);
    return {
      size: object.blob.size,
      body: object.stream,
      arrayBuffer: () => response.arrayBuffer(),
      text: () => response.text(),
    };
  }
  async put(
    key: string,
    data: string | Uint8Array,
    options?: { httpMetadata?: { contentType: string } },
  ) {
    return put(key, typeof data === "string" ? data : Buffer.from(data), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType:
        options?.httpMetadata?.contentType ?? "application/octet-stream",
    });
  }
  async list({ prefix }: { prefix: string }) {
    const objects: { key: string; size: number }[] = [];
    let cursor: string | undefined;
    do {
      const result = await list({ prefix, cursor, limit: 1000 });
      objects.push(
        ...result.blobs.map((b) => ({ key: b.pathname, size: b.size })),
      );
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    return { objects };
  }
  async delete(keys: string | string[]) {
    if (!Array.isArray(keys) || keys.length) await del(keys);
  }
}
export function streamText(text: string) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + 65536));
      offset += 65536;
    },
  });
}
