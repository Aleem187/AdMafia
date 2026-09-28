import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let { platform, code, redirectUri, userId, state } = await req.json();

    if (!code || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase service client early so we can do fast lookups
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // If platform isn't provided, attempt to determine it by looking up the state
    // Also prefetch any code_verifier in the same query to avoid a second DB roundtrip
    let prefetchedVerifier: { platform?: string; code_verifier?: string } | null = null;
    if ((!platform || platform === '') && state) {
      const { data: stored } = await supabase.from('oauth_verifiers').select('platform, code_verifier').eq('state', state).maybeSingle();
      if (stored) {
        prefetchedVerifier = stored as any;
        if (stored.platform) platform = stored.platform as string;
      }
    }

    if (!platform) {
      return new Response(
        JSON.stringify({ error: "Platform not determined" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string;
    let refreshToken: string | null = null;
    let expiresIn: number | null = null;
    let platformUserId: string | null = null;
    let scope: string | null = null;

    // Exchange authorization code for access token
    if (platform === 'meta') {
      const appId = Deno.env.get("META_APP_ID")!;
      const appSecret = Deno.env.get("META_APP_SECRET")!;
      const tokenResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
      const tokenData = await tokenResponse.json();
      if (tokenData.error) throw new Error(tokenData.error.message || "Meta token exchange failed");
      accessToken = tokenData.access_token;
      expiresIn = tokenData.expires_in ?? null;
      // Get long-lived token
      const longLivedResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`);
      const longLivedData = await longLivedResponse.json();
      if (longLivedData.access_token) {
        accessToken = longLivedData.access_token;
        expiresIn = longLivedData.expires_in ?? null;
      }
      // Get user ID
      const meResponse = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}`);
      const meData = await meResponse.json();
      platformUserId = meData.id ?? null;
    } else if (platform === 'google') {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenResponse.json();
      if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error || "Google token exchange failed");
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token ?? null;
      expiresIn = tokenData.expires_in ?? null;
      scope = tokenData.scope ?? null;
      // Get user info
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json();
      platformUserId = userInfo.id ?? null;
    } else if (platform === 'tiktok') {
      const appId = Deno.env.get("TIKTOK_APP_ID") ?? Deno.env.get("TIKTOK_API_ID");
      const appSecret = Deno.env.get("TIKTOK_APP_SECRET") ?? Deno.env.get("TIKTOK_API_SECRET");
      if (!appId || !appSecret) {
        throw new Error("TikTok app not configured. Set TIKTOK_APP_ID/TIKTOK_APP_SECRET or TIKTOK_API_ID/TIKTOK_API_SECRET secrets.");
      }
      // Determine code_verifier before exchanging the code. Use the prefetched verifier
      // (from the initial lookup) when available to avoid an extra DB roundtrip.
      let code_verifier: string | undefined = undefined;
      if (prefetchedVerifier && prefetchedVerifier.code_verifier) {
        code_verifier = prefetchedVerifier.code_verifier;
      } else if (state) {
        const { data: stored } = await supabase.from('oauth_verifiers').select('code_verifier').eq('state', state).maybeSingle();
        if (stored && stored.code_verifier) {
          code_verifier = stored.code_verifier as string;
        }
      }

      // Build token exchange body for TikTok Login Kit (v2)
      const tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
      const clientKeyRaw = String(appId);
      const clientSecretRaw = String(appSecret);
      console.log("client_key raw length:", clientKeyRaw.length, "trimmed length:", clientKeyRaw.trim().length);
      console.log("client_secret raw length:", clientSecretRaw.length, "trimmed length:", clientSecretRaw.trim().length);
      const clientKey = clientKeyRaw.trim();
      const clientSecret = clientSecretRaw.trim();

      // Use URLSearchParams to send form-encoded body as required by Login Kit v2
      const params = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      if (code_verifier) params.append("code_verifier", code_verifier);

      // TikTok Sandbox apps require this header on Login Kit v2 calls, or the
      // token endpoint returns invalid_client even with correct credentials.
      // Remove/gate this once the app moves to Production.
      const tokenHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-tt-env": "sandbox",
      };

      const bodyFieldNames = ["client_key", "client_secret", "code", "grant_type", "redirect_uri"];
      if (code_verifier) bodyFieldNames.push("code_verifier");

      console.log("TikTok token exchange request:", {
        url: tokenUrl,
        headerNames: Object.keys(tokenHeaders),
        bodyFieldNames,
        clientKeyLength: clientKey.length,
        clientSecretLength: clientSecret.length,
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: tokenHeaders,
        body: params.toString(),
      });

      const tokenText = await tokenResponse.text();
      let tokenData: any;
      try {
        tokenData = JSON.parse(tokenText);
      } catch (e) {
        tokenData = tokenText;
      }

      console.log("TikTok token response status:", tokenResponse.status);
      console.log("TikTok token response body:", typeof tokenData === 'string' ? tokenData : JSON.stringify(tokenData));

      const failed = !tokenResponse.ok || (typeof tokenData === 'object' && (tokenData.error || (tokenData.code && tokenData.code !== 0)));
      if (failed) {
        throw new Error(`TikTok token exchange failed: status=${tokenResponse.status} body=${typeof tokenData === 'string' ? tokenData : JSON.stringify(tokenData)}`);
      }

      // Normalize response shapes: Business API uses tokenData.data, Login Kit may return top-level tokens
      if (tokenData && typeof tokenData === 'object' && tokenData.data) {
        accessToken = tokenData.data.access_token;
        refreshToken = tokenData.data.refresh_token ?? null;
        expiresIn = tokenData.data.expires_in ?? null;
        platformUserId = String(tokenData.data.advertiser_id ?? tokenData.data.user_id ?? '');
      } else if (tokenData && typeof tokenData === 'object') {
        accessToken = tokenData.access_token ?? null;
        refreshToken = tokenData.refresh_token ?? null;
        expiresIn = tokenData.expires_in ?? null;
        platformUserId = String(tokenData.advertiser_id ?? tokenData.user_id ?? '');
      } else {
        throw new Error(`TikTok token exchange returned unexpected body: ${tokenText}`);
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid platform" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the token in platform_tokens (service role bypasses RLS)
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // Delete any existing token for this user+platform
    await supabase.from("platform_tokens").delete().eq("user_id", userId).eq("platform", platform);

    const { error: tokenError } = await supabase.from("platform_tokens").insert({
      user_id: userId,
      platform,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      scope,
      platform_user_id: platformUserId,
    });

    if (tokenError) throw new Error(`Failed to store token: ${tokenError.message}`);

    // Now fetch the user's ad accounts from the platform
    let accounts: Array<{ account_id: string; account_name: string }> = [];

    if (platform === 'meta') {
      // Fetch ad accounts
      const accountsResponse = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=account_id,name,account_status,currency&limit=100&access_token=${accessToken}`);
      const accountsData = await accountsResponse.json();
      accounts = (accountsData.data ?? []).map((a: { account_id: string; name: string }) => ({
        account_id: a.account_id,
        account_name: a.name,
      }));
    } else if (platform === 'google') {
      accounts = await fetchGoogleAdsAccounts(accessToken);
    } else if (platform === 'tiktok') {
      // Fetch advertiser accounts
      if (platformUserId) {
        accounts = [{
          account_id: platformUserId,
          account_name: 'TikTok Ads Account',
        }];
      }
    }

    // Store ad accounts in the database
    const insertedAccounts = [];
    for (const account of accounts) {
      // Check if this account already exists for this user
      const { data: existing } = await supabase
        .from("ad_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", platform)
        .eq("account_id", account.account_id)
        .maybeSingle();

      if (existing) {
        // Update status to connected
        await supabase
          .from("ad_accounts")
          .update({ status: 'connected', error_message: null })
          .eq("id", existing.id);
        insertedAccounts.push({ id: existing.id, ...account });
        continue;
      }

      const { data: newAccount, error: insertError } = await supabase
        .from("ad_accounts")
        .insert({
          user_id: userId,
          platform,
          account_id: account.account_id,
          account_name: account.account_name,
          status: 'connected',
          metadata: { platform_user_id: platformUserId },
        })
        .select("id, account_id, account_name")
        .single();

      if (!insertError && newAccount) {
        insertedAccounts.push(newAccount);
      }
    }

    return new Response(
      JSON.stringify({ platform, accounts: insertedAccounts, count: insertedAccounts.length }),
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

// Reads a fetch Response body as JSON, but never throws a raw "Unexpected
// token '<'" JSON.parse error. Google (and other platform) APIs sometimes
// return an HTML error/login page instead of JSON — e.g. a retired API
// version, a routing/gateway error, or an auth redirect — and that's much
// easier to diagnose if we log and surface the actual body instead of
// crashing on JSON.parse.
async function parseJsonResponse(response: Response, context: string): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 500);
    console.error(`${context}: non-JSON response (status ${response.status}, content-type ${response.headers.get("content-type")}). Body starts with: ${snippet}`);
    throw new Error(`${context} returned a non-JSON response (status ${response.status}): ${snippet}`);
  }
}

// Discovers the real Google Ads customer accounts this OAuth token can access,
// via the Google Ads API (not just the OAuth userinfo profile).
async function fetchGoogleAdsAccounts(accessToken: string): Promise<Array<{ account_id: string; account_name: string }>> {
  // As of the September 9, 2026 developer-token sunset, Google Ads API access
  // level is determined by the Google Cloud project behind GOOGLE_CLIENT_ID,
  // not by this header — Google now accepts requests without it and ignores
  // it if present. We still forward it when set (harmless), but no longer
  // block discovery on its absence. If calls below fail with something like
  // "Method not found" or a permission error, the real fix is almost always
  // granting that Cloud project Google Ads API access (Test/Basic/Standard)
  // from its "Google Ads API" page in Cloud Console, not this token.
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  // Only needed when this Google account reaches its ad accounts through a
  // manager (MCC) account rather than owning them directly.
  const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, "");

  const listHeaders: Record<string, string> = { "Authorization": `Bearer ${accessToken}` };
  if (developerToken) listHeaders["developer-token"] = developerToken;

  const listResponse = await fetch("https://googleads.googleapis.com/v26/customers:listAccessibleCustomers", {
    headers: listHeaders,
  });
  const listData = await parseJsonResponse(listResponse, "Google Ads listAccessibleCustomers");
  if (!listResponse.ok) {
    throw new Error(`Google Ads account lookup failed: ${listData.error?.message ?? JSON.stringify(listData)}`);
  }

  const resourceNames: string[] = listData.resourceNames ?? [];
  if (resourceNames.length === 0) {
    throw new Error("This Google account has no accessible Google Ads accounts. Grant it access in Google Ads and try again.");
  }

  const accounts: Array<{ account_id: string; account_name: string }> = [];
  for (const resourceName of resourceNames) {
    const customerId = resourceName.split("/")[1];
    if (!customerId) continue;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    };
    if (developerToken) headers["developer-token"] = developerToken;
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

    // A single sub-account's detail lookup failing (wrong login-customer-id,
    // an HTML error page, etc.) shouldn't block discovery of the rest —
    // fall back to a generic label instead of throwing.
    let customer: { descriptiveName?: string; manager?: boolean } | null = null;
    try {
      const searchResponse = await fetch(`https://googleads.googleapis.com/v26/customers/${customerId}/googleAds:search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account FROM customer LIMIT 1",
        }),
      });
      const searchData = await parseJsonResponse(searchResponse, `Google Ads customer lookup (${customerId})`);
      if (searchResponse.ok) customer = searchData.results?.[0]?.customer ?? null;
      else console.error(`Google Ads customer lookup (${customerId}) failed:`, searchData.error?.message ?? JSON.stringify(searchData));
    } catch (e) {
      console.error(`Google Ads customer lookup (${customerId}) threw:`, e instanceof Error ? e.message : e);
    }
    const label = customer?.descriptiveName || `Google Ads Account ${customerId}`;
    accounts.push({
      account_id: customerId,
      account_name: customer?.manager ? `${label} (Manager)` : label,
    });
  }

  return accounts;
}
