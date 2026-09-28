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
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all published ads for this user that are live
    const { data: publishedAds } = await supabase
      .from("published_ads")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["live", "queued"]);

    if (!publishedAds || publishedAds.length === 0) {
      return new Response(
        JSON.stringify({ synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by platform
    const { data: adAccounts } = await supabase
      .from("ad_accounts")
      .select("*")
      .eq("user_id", userId);

    if (!adAccounts) {
      return new Response(
        JSON.stringify({ synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountMap = new Map(adAccounts.map(a => [a.id, a]));
    let syncedCount = 0;

    // Get tokens per platform
    const { data: tokens } = await supabase
      .from("platform_tokens")
      .select("*")
      .eq("user_id", userId);

    const tokenMap = new Map((tokens ?? []).map(t => [t.platform, t]));

    for (const ad of publishedAds) {
      const account = accountMap.get(ad.ad_account_id);
      if (!account) continue;

      const token = tokenMap.get(account.platform);
      if (!token) continue;

      let accessToken = token.access_token;
      const expiresAt = token.token_expires_at ? new Date(token.token_expires_at) : null;
      const needsRefresh = expiresAt && expiresAt.getTime() < Date.now() + 60000;

      if (needsRefresh && token.refresh_token) {
        try {
          accessToken = await refreshToken(account.platform, token.refresh_token);
          await supabase
            .from("platform_tokens")
            .update({ access_token: accessToken, updated_at: new Date().toISOString() })
            .eq("id", token.id);
        } catch {
          continue;
        }
      }

      try {
        // Fetch yesterday's performance from the platform
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split("T")[0];

        let metrics = null;

        if (account.platform === 'meta' && ad.platform_ad_id) {
          metrics = await fetchMetaInsights(accessToken, account.account_id, ad.platform_ad_id, dateStr);
        } else if (account.platform === 'google' && ad.platform_ad_id) {
          metrics = await fetchGoogleAdsMetrics(accessToken, account.account_id, ad.platform_ad_id, dateStr);
        } else if (account.platform === 'tiktok' && ad.platform_ad_id) {
          metrics = await fetchTikTokMetrics(accessToken, account.account_id, ad.platform_ad_id, dateStr);
        }

        if (metrics) {
          // Check if performance record already exists for this date
          const { data: existing } = await supabase
            .from("ad_performance")
            .select("id")
            .eq("published_ad_id", ad.id)
            .eq("date", dateStr)
            .maybeSingle();

          if (existing) {
            // Update existing record
            await supabase
              .from("ad_performance")
              .update({
                spend: metrics.spend,
                clicks: metrics.clicks,
                impressions: metrics.impressions,
                conversions: metrics.conversions,
                revenue: metrics.revenue,
              })
              .eq("id", existing.id);
          } else {
            // Insert new record
            await supabase.from("ad_performance").insert({
              published_ad_id: ad.id,
              user_id: userId,
              date: dateStr,
              spend: metrics.spend,
              clicks: metrics.clicks,
              impressions: metrics.impressions,
              conversions: metrics.conversions,
              revenue: metrics.revenue,
            });
          }
          syncedCount++;
        }
      } catch {
        // Skip this ad if sync fails
      }
    }

    return new Response(
      JSON.stringify({ synced: syncedCount }),
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

async function refreshToken(platform: string, refreshToken: string): Promise<string> {
  if (platform === 'meta') {
    const appId = Deno.env.get("META_APP_ID")!;
    const appSecret = Deno.env.get("META_APP_SECRET")!;
    const response = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${refreshToken}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.access_token;
  } else if (platform === 'google') {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data.access_token;
  } else if (platform === 'tiktok') {
    const appId = Deno.env.get("TIKTOK_APP_ID") ?? Deno.env.get("TIKTOK_API_ID");
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET") ?? Deno.env.get("TIKTOK_API_SECRET");
    if (!appId || !appSecret) {
      throw new Error("TikTok app not configured. Set TIKTOK_APP_ID/TIKTOK_APP_SECRET or TIKTOK_API_ID/TIKTOK_API_SECRET secrets.");
    }
    const auth = btoa(`${appId}:${appSecret}`);
    const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
      body: JSON.stringify({ refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    const data = await response.json();
    if (data.code !== 0) throw new Error(data.message);
    return data.data.access_token;
  }
  throw new Error("Unknown platform");
}

async function fetchMetaInsights(accessToken: string, accountId: string, adId: string, dateStr: string): Promise<{ spend: number; clicks: number; impressions: number; conversions: number; revenue: number } | null> {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${adId}/insights?fields=spend,clicks,impressions,actions&time_range={"since":"${dateStr}","until":"${dateStr}"}&access_token=${accessToken}`
  );
  const data = await response.json();
  if (data.error) return null;
  const insight = data.data?.[0];
  if (!insight) return null;
  const conversions = (insight.actions ?? []).filter((a: { action_type: string }) => a.action_type === 'offsite_conversion').reduce((s: number, a: { value: string }) => s + Number(a.value), 0);
  return {
    spend: Number(insight.spend ?? 0),
    clicks: Number(insight.clicks ?? 0),
    impressions: Number(insight.impressions ?? 0),
    conversions,
    revenue: 0,
  };
}

async function fetchGoogleAdsMetrics(accessToken: string, customerId: string, campaignResource: string, dateStr: string): Promise<{ spend: number; clicks: number; impressions: number; conversions: number; revenue: number } | null> {
  // As of the September 9, 2026 developer-token sunset, Google Ads API access
  // level is determined by the Google Cloud project behind GOOGLE_CLIENT_ID,
  // not by this header — it's optional and ignored if sent.
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const cleanId = customerId.replace(/-/g, '');
  const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, '');
  const response = await fetch(`https://googleads.googleapis.com/v26/customers/${cleanId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      ...(developerToken ? { "developer-token": developerToken } : {}),
      // Required when this account is only reachable through a manager (MCC) account.
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
    },
    body: JSON.stringify({
      query: `SELECT campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date = '${dateStr}' AND campaign.resource_name = '${campaignResource}'`,
    }),
  });
  const data = await response.json();
  if (!response.ok) return null;
  const result = data[0]?.results?.[0]?.metrics;
  if (!result) return null;
  return {
    spend: Number(result.costMicros ?? 0) / 1_000_000,
    clicks: Number(result.clicks ?? 0),
    impressions: Number(result.impressions ?? 0),
    conversions: Number(result.conversions ?? 0),
    revenue: Number(result.conversionsValue ?? 0),
  };
}

async function fetchTikTokMetrics(accessToken: string, advertiserId: string, campaignId: string, dateStr: string): Promise<{ spend: number; clicks: number; impressions: number; conversions: number; revenue: number } | null> {
  const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
    method: "GET",
    headers: { "Access-Token": accessToken },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: "CAMPAIGN",
      dimensions: '["campaign_id"]',
      metrics: '["stat_cost","clicks","impressions","conversion","conversion_value"]',
      start_date: dateStr,
      end_date: dateStr,
      filter: JSON.stringify({ field: "campaign_id", type: "IN", values: [campaignId] }),
    }),
  });
  const data = await response.json();
  if (data.code !== 0) return null;
  const row = data.data?.list?.[0]?.metrics;
  if (!row) return null;
  return {
    spend: Number(row.stat_cost ?? 0),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    conversions: Number(row.conversion ?? 0),
    revenue: Number(row.conversion_value ?? 0),
  };
}
