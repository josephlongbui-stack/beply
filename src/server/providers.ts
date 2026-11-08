import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, sampleDocument } from "../domain/service";
import type {
  DocumentRecord,
  State,
  Offer,
  PriceObservation,
} from "../domain/types";
export interface DocumentExtractionProvider {
  extract(bytes: Uint8Array, state: State): Partial<DocumentRecord> | null;
}
export interface PriceSource {
  quotes(state: State): Offer[];
}
export interface ForecastProvider {
  outlook(
    history: PriceObservation[],
    clock: string,
  ): { date: string; price: number; low: number; high: number }[];
}
export interface OrderProvider {
  submit(orderId: string): { reference: string; simulated: true };
}
export const sampleExtraction: DocumentExtractionProvider = {
  extract(bytes, state) {
    let manifest: Record<string, string>;
    try {
      manifest = JSON.parse(
        readFileSync(
          join(process.cwd(), "public/samples/manifest.json"),
          "utf8",
        ),
      );
    } catch {
      return null;
    }
    const match = Object.entries(manifest).find(
      ([, hash]) => hash === contentHash(bytes),
    );
    return match
      ? sampleDocument(
          state,
          match[0] as "baguette" | "butter_bun" | "receipt" | "statement",
        )
      : null;
  },
};
export const demoPriceSource: PriceSource = { quotes: (state) => state.offers };
export const mockOrderProvider: OrderProvider = {
  submit: (orderId) => ({
    reference: `SIM-${orderId.slice(0, 8)}`,
    simulated: true,
  }),
};
