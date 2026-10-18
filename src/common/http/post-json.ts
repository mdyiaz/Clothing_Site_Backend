import { request as httpsRequest } from 'https';

export interface JsonResponse {
  status: number;
  json: Record<string, unknown>;
}

/**
 * Minimal HTTPS JSON POST helper (node:https only — no global fetch, no deps).
 * Used for outbound provider calls (mail, SMS, gateways) where the URL comes
 * from trusted config.
 */
export function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const req = httpsRequest(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: Record<string, unknown> = {};
          try {
            json = JSON.parse(text) as Record<string, unknown>;
          } catch {
            // non-JSON body (e.g. HTML error page) → leave json as {}
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.write(payload);
    req.end();
  });
}
