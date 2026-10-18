import { request as httpsRequest } from 'https';

export interface JsonResponse {
  status: number;
  json: Record<string, unknown>;
}

/**
 * Minimal HTTPS JSON GET helper (node:https only — no global fetch, no deps).
 * Counterpart to `postJson` for outbound read-only provider calls (e.g. 3PL
 * shipment tracking) where the URL comes from trusted config.
 */
export function getJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET', headers, timeout: 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          // non-JSON body → leave json as {}
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}
