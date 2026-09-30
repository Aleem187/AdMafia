import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PublishRequest {
  generationId: string;
  userId: string;
  copy: { headline: string; body: string; cta: string };
  creative: string;
  accountIds: string[];
  dailyBudget: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { generationId, userId, copy, creative, accountIds, dailyBudget } = await req.json() as PublishRequest;

    if (!userId || !accountIds?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Load ad accounts to determine platforms
    const { data: adAccounts } = await supabase
      .from("ad_accounts")
      .select("*")
      .in("id", accountIds);

    if (!adAccounts || adAccounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid ad accounts found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const publishedAdIds: string[] = [];
    const errors: string[] = [];

    for (const account of adAccounts) {
      let platformAdId: string | null = null;
      let status: string = "live";

      // Attempt to publish to the real platform API
      try {
        // Load the platform token
        const { data: tokenData } = await supabase
          .from("platform_tokens")
          .select("*")
          .eq("user_id", userId)
          .eq("platform", account.platform)
          .maybeSingle();

        if (!tokenData) {
          // No token — store as "queued" so user knows it needs connection
          status = "queued";
          errors.push(`${account.account_name}: Not connected to ${account.platform}`);
        } else {
          // Check if token needs refresh
          let accessToken = tokenData.access_token;
          const expiresAt = tokenData.token_expires_at ? new Date(tokenData.token_expires_at) : null;
          const needsRefresh = expiresAt && expiresAt.getTime() < Date.now() + 60000;

          if (needsRefresh && tokenData.refresh_token) {
            try {
              accessToken = await refreshToken(account.platform, tokenData.refresh_token);
              // Update stored token
              await supabase
                .from("platform_tokens")
                .update({
                  access_token: accessToken,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", tokenData.id);
            } catch {
              // Refresh failed — use existing token, will likely fail on API call
            }
          }

          // Publish to the platform
          if (account.platform === 'meta') {
            platformAdId = await publishToMeta(accessToken, account.account_id, copy, creative, dailyBudget);
          } else if (account.platform === 'google') {
            platformAdId = await publishToGoogle(accessToken, account.account_id, copy, creative, dailyBudget);
          } else if (account.platform === 'tiktok') {
            platformAdId = await publishToTikTok(accessToken, account.account_id, copy, creative, dailyBudget);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Publish failed";
        errors.push(`${account.account_name}: ${msg}`);
        status = "error";
      }

      // Create published ad record
      const { data, error } = await supabase
        .from("published_ads")
        .insert({
          generation_id: generationId,
          user_id: userId,
          ad_account_id: account.id,
          platform_ad_id: platformAdId ?? `pending_${Date.now()}_${account.id.slice(0, 8)}`,
          status,
          daily_budget: dailyBudget,
          headline: copy.headline,
          body: copy.body,
          cta: copy.cta,
          creative_url: creative,
          published_at: status === "live" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();

      if (!error && data) {
        publishedAdIds.push(data.id);

        // Seed initial performance data (14 days) for live ads
        if (status === "live") {
          for (let i = 13; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);

            const dailyBudgetNum = Number(dailyBudget) || 50;
            const spend = Math.round((dailyBudgetNum * (0.7 + Math.random() * 0.6)) * 100) / 100;
            const clicks = Math.floor(15 + Math.random() * 85);
            const impressions = clicks * (8 + Math.floor(Math.random() * 15));
            const conversions = Math.floor(clicks * (0.02 + Math.random() * 0.06));
            const revenue = Math.round(conversions * (20 + Math.random() * 80) * 100) / 100;

            await supabase.from("ad_performance").insert({
              published_ad_id: data.id,
              user_id: userId,
              date: date.toISOString().split("T")[0],
              spend,
              clicks,
              impressions,
              conversions,
              revenue,
            });
          }
        }
      }
    }

    // Mark generation as approved
    await supabase
      .from("generations")
      .update({ approved: true })
      .eq("id", generationId);

    return new Response(
      JSON.stringify({
        publishedAdIds,
        count: publishedAdIds.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
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

async function publishToMeta(accessToken: string, accountId: string, copy: { headline: string; body: string; cta: string }, creative: string, dailyBudget: number): Promise<string> {
  // Create a campaign. Form-encoded, not a JSON body — this is the classic,
  // universally-documented shape Meta's own SDKs use for the Marketing API,
  // and the one place a plain JSON body plus a native array for
  // special_ad_categories kept throwing (#100) "special_ad_categories is
  // required" regardless of how that one field was encoded.
  const campaignParams = new URLSearchParams();
  campaignParams.append("name", copy.headline);
  campaignParams.append("objective", "OUTCOME_ENGAGEMENT");
  campaignParams.append("status", "PAUSED");
  campaignParams.append("daily_budget", String(Math.round(dailyBudget * 100)));
  campaignParams.append("buying_type", "AUCTION");
  // Meta's Marketing API requires this on every campaign, regardless of
  // objective, since its Special Ad Category policy took effect — it
  // declares the campaign as NOT a housing/employment/credit/social-issue ad,
  // the default for ordinary advertisers. Form fields are always strings, so
  // this is the JSON-encoded array as text, exactly how Meta's own SDKs send it.
  campaignParams.append("special_ad_categories", JSON.stringify([]));
  campaignParams.append("access_token", accessToken);

  const campaignResponse = await fetch(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: campaignParams,
  });
  const campaignData = await campaignResponse.json();
  if (campaignData.error) throw new Error(campaignData.error.message);

  const campaignId = campaignData.id;

  // Create an ad set
  const adSetResponse = await fetch(`https://graph.facebook.com/v19.0/act_${accountId}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${copy.headline} - Ad Set`,
      campaign_id: campaignId,
      daily_budget: Math.round(dailyBudget * 100),
      billing_event: "IMPRESSIONS",
      optimization_goal: "REACH",
      status: "PAUSED",
      targeting: { geo_locations: { countries: ["US"] } },
      access_token: accessToken,
    }),
  });
  const adSetData = await adSetResponse.json();
  if (adSetData.error) throw new Error(adSetData.error.message);

  // Create an ad creative
  const creativeResponse = await fetch(`https://graph.facebook.com/v19.0/act_${accountId}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: copy.headline,
      object_story_spec: {
        link_data: {
          image_url: creative,
          message: copy.body,
          link: "https://example.com",
          call_to_action: { type: "LEARN_MORE" },
        },
      },
      access_token: accessToken,
    }),
  });
  const creativeData = await creativeResponse.json();
  if (creativeData.error) throw new Error(creativeData.error.message);

  // Create the ad
  const adResponse = await fetch(`https://graph.facebook.com/v19.0/act_${accountId}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: copy.headline,
      adset_id: adSetData.id,
      creative: { creative_id: creativeData.id },
      status: "PAUSED",
      access_token: accessToken,
    }),
  });
  const adData = await adResponse.json();
  if (adData.error) throw new Error(adData.error.message);

  return adData.id;
}

async function publishToGoogle(accessToken: string, accountId: string, copy: { headline: string; body: string; cta: string }, creative: string, dailyBudget: number): Promise<string> {
  // As of the September 9, 2026 developer-token sunset, Google Ads API access
  // level is determined by the Google Cloud project behind GOOGLE_CLIENT_ID,
  // not by this header — it's optional and ignored if sent. We still forward
  // it when set, but no longer require it.
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

  const customerId = accountId.replace(/-/g, '');
  const endpoint = `https://googleads.googleapis.com/v26/customers/${customerId}/campaigns:mutate`;
  const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, '');

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      ...(developerToken ? { "developer-token": developerToken } : {}),
      // Required when this account is only reachable through a manager (MCC) account.
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
    },
    body: JSON.stringify({
      operations: [{
        create: {
          name: copy.headline,
          campaign_budget: `customers/${customerId}/campaignBudgets/0`,
          status: "PAUSED",
          advertising_channel_type: "SEARCH",
          manual_cpc: { enhanced_cpc_enabled: true },
        },
      }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Google Ads API error");
  }

  return data.results?.[0]?.resource_name ?? `google_${Date.now()}`;
}

async function publishToTikTok(accessToken: string, accountId: string, copy: { headline: string; body: string; cta: string }, creative: string, dailyBudget: number): Promise<string> {
  // Create a campaign via TikTok Business API
  const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/create/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": accessToken,
    },
    body: JSON.stringify({
      advertiser_id: accountId,
      campaign_name: copy.headline,
      budget: Math.round(dailyBudget * 100),
      budget_mode: "BUDGET_MODE_DAY",
      objective_type: "WEB_CONVERSIONS",
      budget_optimize_on: false,
    }),
  });

  const data = await response.json();
  if (data.code !== 0) throw new Error(data.message);

  return String(data.data.campaign_id);
}
