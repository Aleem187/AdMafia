Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { platform, redirectUri } = await req.json();

    if (!platform || !['meta', 'google', 'tiktok'].includes(platform)) {
      return new Response(
        JSON.stringify({ error: "Invalid platform" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a random state for CSRF protection
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');

    // For TikTok PKCE: generate a code_verifier and code_challenge
    // code_verifier: random string
    // code_challenge: base64url(sha256(code_verifier))
    const codeVerifier = crypto.getRandomValues(new Uint8Array(64));
    const codeVerifierB64 = btoa(String.fromCharCode(...Array.from(codeVerifier)));
    // base64url encode: replace +/ with -_ and strip padding
    const code_verifier = codeVerifierB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    async function sha256Base64Url(input: string) {
      const enc = new TextEncoder();
      const data = enc.encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashStr = String.fromCharCode(...hashArray);
      const hashB64 = btoa(hashStr);
      return hashB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    let authUrl = '';

    if (platform === 'meta') {
      const appId = Deno.env.get("META_APP_ID");
      if (!appId) {
        return new Response(
          JSON.stringify({ error: "Meta app not configured. Set META_APP_ID and META_APP_SECRET secrets." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const scopes = "ads_management,ads_read,business_management";
      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}&response_type=code`;
    } else if (platform === 'google') {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      if (!clientId) {
        return new Response(
          JSON.stringify({ error: "Google app not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const scopes = "https://www.googleapis.com/auth/adwords";
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}&response_type=code&access_type=offline&prompt=consent`;
    } else if (platform === 'tiktok') {
      const appId = Deno.env.get("TIKTOK_APP_ID") ?? Deno.env.get("TIKTOK_API_ID");
      const appSecret = Deno.env.get("TIKTOK_APP_SECRET") ?? Deno.env.get("TIKTOK_API_SECRET");
      if (!appId || !appSecret) {
        return new Response(
          JSON.stringify({ error: "TikTok app not configured. Set TIKTOK_APP_ID/TIKTOK_APP_SECRET or TIKTOK_API_ID/TIKTOK_API_SECRET secrets." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // compute code_challenge
      const code_challenge = await sha256Base64Url(code_verifier);

      // Trim client key to avoid leading/trailing whitespace issues
      const clientKey = appId.trim();
      // DEBUG: log client_key lengths only (do NOT log the secret value)
      try {
        console.log('tiktok client_key length:', appId ? appId.length : 0, 'trimmed length:', clientKey.length);
      } catch (e) {
        // ignore logging errors
      }

      const tiktokScope = "user.info.profile";
      authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(clientKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&scope=${encodeURIComponent(tiktokScope)}&code_challenge=${code_challenge}&code_challenge_method=S256`;
    }

    // Persist state -> platform (and, for TikTok, the PKCE code_verifier) for every
    // platform, not just TikTok. This lets oauth-callback (and the frontend's early
    // callback path) resolve which platform a redirect belongs to purely from
    // `state`, instead of the caller having to know or guess it.
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      // lazy import supabase client
      const { createClient } = await import('npm:@supabase/supabase-js@2');
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      await supabase.from('oauth_verifiers').insert({
        state,
        platform,
        code_verifier: platform === 'tiktok' ? code_verifier : null,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      // non-fatal: log and continue, but return error to client
      return new Response(JSON.stringify({ error: 'Failed to store oauth state' }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ authUrl, state }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
