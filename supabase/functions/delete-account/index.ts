import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Decodes the caller's own JWT to get their user id. This function has
// verify_jwt = true (see supabase/config.toml), so the gateway has already
// verified the token's signature before this code ever runs — this just
// reads the already-trusted `sub` claim, rather than trusting a client-
// supplied user id (which would let one user delete another's account).
function getUserIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const userId = getUserIdFromJwt(req.headers.get("Authorization"));
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Storage files aren't linked by a foreign key, so they won't be cleaned
    // up by the cascading deletes below — remove them explicitly first,
    // while we still have the rows that reference them.

    // generated-creatives: uploaded/edited/generated ad images. Paths are
    // flat (no per-user folder), so collect the exact paths this user's
    // generations reference before deleting those rows.
    const { data: generations } = await supabase
      .from("generations")
      .select("creative_urls")
      .eq("user_id", userId);

    const creativePaths: string[] = [];
    for (const g of generations ?? []) {
      const urls = Array.isArray(g.creative_urls) ? g.creative_urls : [];
      for (const url of urls) {
        if (typeof url === "string" && url.includes("/generated-creatives/")) {
          creativePaths.push(decodeURIComponent(url.split("/generated-creatives/")[1]));
        }
      }
    }
    if (creativePaths.length > 0) {
      const { error } = await supabase.storage.from("generated-creatives").remove(creativePaths);
      if (error) console.error("Failed to remove some generated-creatives files:", error.message);
    }

    // product-images: uploaded product/campaign photos, stored under a
    // per-user folder (`${userId}/...`), so we can just list and clear it.
    const { data: productImageFiles, error: listError } = await supabase.storage
      .from("product-images")
      .list(userId);
    if (listError) {
      console.error("Failed to list product-images for user:", listError.message);
    } else if (productImageFiles && productImageFiles.length > 0) {
      const paths = productImageFiles.map((f) => `${userId}/${f.name}`);
      const { error } = await supabase.storage.from("product-images").remove(paths);
      if (error) console.error("Failed to remove some product-images files:", error.message);
    }

    // Deleting the auth user cascades (ON DELETE CASCADE) to every table with
    // a user_id foreign key: subscriptions, ad_accounts, campaign_briefs,
    // generations, published_ads, ad_performance, platform_tokens,
    // oauth_states, and products.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Failed to delete account: ${deleteError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
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
