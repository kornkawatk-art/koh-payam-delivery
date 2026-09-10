// SigV4 presigning for Cloudflare R2 (S3-compatible API).
//
// Batch H ruling: use `aws4fetch` (tiny, Deno-compatible, correct SigV4) —
// do NOT hand-roll the signature with Web Crypto.
//
// Env consumed (already set as edge-function secrets on the project):
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_PUBLIC_BASE_URL
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

function r2Client(): AwsClient {
  return new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    service: 's3',
    region: 'auto',
  })
}

function r2ObjectUrl(key: string): string {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')!
  const bucket = Deno.env.get('R2_BUCKET')!
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
}

export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresSec = 300,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = r2Client()
  const endpoint = r2ObjectUrl(key)
  const signed = await client.sign(
    new Request(`${endpoint}?X-Amz-Expires=${expiresSec}`, {
      method: 'PUT',
      headers: { 'content-type': contentType },
    }),
    { aws: { signQuery: true } },
  )
  return {
    uploadUrl: signed.url,
    publicUrl: `${Deno.env.get('R2_PUBLIC_BASE_URL')}/${key}`,
  }
}

// Server-to-server signed DELETE of one R2 object. aws4fetch signs the request
// headers (SigV4) — no query signing needed for a direct call. Resolves to the
// R2 Response; caller decides what a non-2xx/404 means.
export async function deleteR2Object(key: string): Promise<Response> {
  const client = r2Client()
  return await client.fetch(r2ObjectUrl(key), { method: 'DELETE' })
}
