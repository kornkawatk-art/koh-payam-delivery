// Shared CORS headers for the customer-facing edge functions. Both are called
// from the browser with no Supabase session, so the origin is open and the
// functions do their own auth.
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
