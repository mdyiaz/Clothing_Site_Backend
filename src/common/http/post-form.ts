import { request as httpsRequest } from 'https';

export interface FormResponse {
  status: number;
  json: Record<string, unknown>;
}

/**
 * Minimal HTTPS form POST helper (node:http only — no global fetch, no deps).
 * Used for server-to-server calls where the URL is built from trusted config
 * (e.g. Cloudinary signature verification).
 */
export function postForm(
  url: string,
  fields: Record<string, string | number>,
): Promise<FormResponse> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(
      fields as Record<string, string>,
    ).toString();

    const req = httpsRequest(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
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
    req.write(body);
    req.end();
  });
}
