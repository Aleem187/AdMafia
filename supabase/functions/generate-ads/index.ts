import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CREATIVE_BUCKET = "generated-creatives";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CopyVariant {
  headline: string;
  body: string;
  cta: string;
}

interface GenerateRequest {
  prompt: string;
  assetNames: string[];
  platforms: string[];
  productUrls?: string[];
  imageUrls?: string[];
}

// Words that show up constantly in campaign briefs but never describe the
// product itself — stripping them keeps the fallback query from latching
// onto whatever generic phrase happens to open the brief (e.g. "Launching a
// new line of..."), matching the same kind of filler that produced irrelevant
// Pexels results before.
const IMAGE_QUERY_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with", "is", "are", "be",
  "our", "new", "your", "you", "we", "it", "this", "that", "their", "them",
  "launch", "launching", "introduce", "introducing", "introduces",
  "promote", "promoting", "promotes", "advertise", "advertising", "ad", "ads",
  "target", "targeting", "targets", "audience", "audiences",
  "campaign", "brand", "offer", "offering", "code", "discount", "sale", "off",
  "order", "first", "emphasize", "emphasizing", "tone", "style", "styles", "line", "using", "use",
]);

// Pulls readable words out of a product URL's path, e.g.
// "https://toughhook.com/products/rhino-hanger?ref=ad" -> "rhino hanger".
function extractWordsFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname
      .split("/")
      .pop()
      ?.replace(/\.[a-zA-Z0-9]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() ?? "";
  } catch {
    return "";
  }
}

// Used only when no OpenAI key is configured, or the model call fails —
// the primary path is the AI-extracted `imageSearchQuery` above.
function buildFallbackImageQuery(prompt: string, assetNames?: string[], productUrls?: string[]): string {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !IMAGE_QUERY_STOPWORDS.has(w.toLowerCase()));
  const fromPrompt = words.slice(0, 6).join(" ");

  // Uploaded asset filenames often literally name the product, e.g. "rhino-hanger.jpg".
  const firstAsset = assetNames?.[0];
  const fromAsset = firstAsset
    ? firstAsset.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[-_]+/g, " ").trim()
    : "";

  // A pasted product page URL's slug is often the strongest signal of all.
  const fromUrl = productUrls?.[0] ? extractWordsFromUrl(productUrls[0]) : "";

  const combined = [fromUrl, fromAsset, fromPrompt].filter(Boolean).join(" ").trim();
  return combined || prompt.split(" ").slice(0, 4).join(" ");
}

// Four distinct angle/setting/style treatments so the 4 generated creatives
// give real variety instead of near-duplicates of the same shot.
const IMAGE_VARIANT_STYLES = [
  "shot straight-on against a clean seamless white studio background, soft even lighting",
  "shot at a three-quarter angle on a neutral gray backdrop, dramatic directional side lighting",
  "shown in a realistic lifestyle setting being used as intended, natural daylight",
  "close-up detail shot emphasizing texture and material, softbox studio lighting",
];

function buildImageGenPrompt(subject: string, styleIndex: number): string {
  const style = IMAGE_VARIANT_STYLES[styleIndex % IMAGE_VARIANT_STYLES.length];
  return `A professional product photo of ${subject}, ${style}, commercial advertising style, high quality, photorealistic. No text, no logos, no watermarks.`;
}

// Same 4 style treatments, but as an instruction to change only the scene
// around an existing product photo — used with the images/edits endpoint,
// which is given the real photo and must leave the product itself untouched.
function buildEditPrompt(styleIndex: number): string {
  const style = IMAGE_VARIANT_STYLES[styleIndex % IMAGE_VARIANT_STYLES.length];
  return `Edit this product photo. Keep the product itself exactly as shown — identical shape, colors, materials, proportions, logo, printed text, and packaging, with no distortion or redesign. Do not alter, remove, or replace the product in any way. Change ONLY the background, scene, lighting, and camera angle: ${style}. Commercial advertising photography, high quality, photorealistic. No added text, no logos, no watermarks.`;
}

// A neutral, dependency-free placeholder (no third-party stock photo) for a
// single creative slot when that slot's generation or upload fails — keeps
// the flow returning exactly 4 creativeUrls instead of crashing or shrinking
// the array.
function placeholderCreative(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">` +
    `<rect width="100%" height="100%" fill="#e5e7eb"/>` +
    `<text x="50%" y="50%" font-family="sans-serif" font-size="28" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Rewrites a Supabase Storage public URL to use the container-internal
// SUPABASE_URL host. In local dev, the publicly-reachable URL (e.g.
// "http://127.0.0.1:54321") is not reachable *from inside* this edge
// function's own container — only the Docker-internal address (e.g.
// "http://kong:8000") is. In a real hosted Supabase project there's no such
// split, so this is effectively a no-op there.
function toInternalStorageUrl(publicUrl: string, internalBaseUrl: string): string {
  try {
    const u = new URL(publicUrl);
    return `${internalBaseUrl}${u.pathname}${u.search}`;
  } catch {
    return publicUrl;
  }
}

// Base64-encodes a Blob in fixed-size chunks — spreading a large Uint8Array
// directly into String.fromCharCode can overflow the call stack for
// multi-megabyte images.
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Decodes a base64 image, uploads it to Supabase Storage, and returns a
// public HTTPS URL (not a base64 data: URI — publish-ads sends this URL
// straight to Meta's adcreatives API, which fetches it server-side and
// cannot resolve a data: URI). Shared by both the text-to-image and
// image-edit paths below.
async function uploadGeneratedImage(
  supabase: ReturnType<typeof createClient>,
  publicBaseUrl: string,
  b64: string
): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(CREATIVE_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  // Built manually from `publicBaseUrl` rather than via getPublicUrl(), which
  // just echoes back whatever host the client was constructed with. In local
  // dev, SUPABASE_URL (required for the upload call above to even reach the
  // gateway from inside the container) is the Docker-internal "http://kong:8000",
  // not something a browser or Meta's servers can resolve.
  return `${publicBaseUrl}/storage/v1/object/public/${CREATIVE_BUCKET}/${path}`;
}

// Generates one product image from a text prompt via OpenAI's gpt-image-1
// (no reference photo available) and uploads it to Supabase Storage.
async function generateProductImage(
  supabase: ReturnType<typeof createClient>,
  publicBaseUrl: string,
  openaiKey: string,
  prompt: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
      output_format: "jpeg",
      // gpt-image-1 has no response_format param — it always returns b64_json.
    }),
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (status ${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Image generation failed (status ${response.status})`);
  }

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");

  return uploadGeneratedImage(supabase, publicBaseUrl, b64);
}

// Edits a real product photo via OpenAI's gpt-image-1 images/edits endpoint
// instead of generating from scratch — the actual product must come through
// unchanged, only the background/scene/lighting/angle should differ.
async function editProductImage(
  supabase: ReturnType<typeof createClient>,
  publicBaseUrl: string,
  internalBaseUrl: string,
  openaiKey: string,
  sourceImageUrl: string,
  editPrompt: string
): Promise<string> {
  const sourceResponse = await fetch(toInternalStorageUrl(sourceImageUrl, internalBaseUrl));
  if (!sourceResponse.ok) {
    throw new Error(`Could not fetch source product image (status ${sourceResponse.status})`);
  }
  const sourceBlob = await sourceResponse.blob();

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("image", sourceBlob, "product.jpg");
  form.append("prompt", editPrompt);
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("quality", "medium");
  // Preserve the input product's appearance (shape, color, logo, text) as
  // closely as possible instead of loosely reinterpreting it.
  form.append("input_fidelity", "high");
  // NOTE: do not set a Content-Type header manually — fetch sets the
  // multipart boundary itself when the body is a FormData instance.

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}` },
    body: form,
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (status ${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Image edit failed (status ${response.status})`);
  }

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");

  return uploadGeneratedImage(supabase, publicBaseUrl, b64);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { prompt, assetNames, platforms, productUrls, imageUrls } = await req.json() as GenerateRequest;

    if (!prompt || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Internal (Docker-reachable) vs. public (browser/OpenAI-reachable)
    // Supabase URLs, computed once and reused by both the copy step (to
    // embed a product photo for vision) and the image step below.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const publicBaseUrl =
      Deno.env.get("SUPABASE_PUBLIC_URL") || Deno.env.get("VITE_SUPABASE_URL") || supabaseUrl;

    // 1. Generate ad copy variants (and an image search query) using OpenAI
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    let copyVariants: CopyVariant[] = [];
    // Short, concrete, product-only phrase for stock photo search — extracted
    // by the model from the brief, not sliced from the raw text, so it's
    // right regardless of where in the brief the product is mentioned.
    let imageSearchQuery: string | null = null;

    if (openaiKey) {
      const platformList = platforms?.length
        ? platforms.join(", ")
        : "Meta, Google, TikTok";

      const systemPrompt = `You are an expert advertising copywriter and creative director. Based ONLY on the campaign brief, uploaded product images, and product page link(s) provided below, generate ad copy and an image search phrase.

Strict factual rules — the copy must be based strictly on what is actually provided, nothing about the product may be invented:
- Use ONLY facts, claims, offers, and details explicitly stated in the campaign brief. Never invent statistics, discounts, guarantees, features, or benefits that aren't stated.
- If the brief names the product, reproduce that exact product name verbatim everywhere you reference it — do not alter its spelling, capitalization, or substitute a different name.
- Never include a raw URL in "headline", "body", or "cta".
- If the brief is vague or missing a detail (e.g. no stated discount), do not fill the gap with generic marketing filler — write persuasive copy from only what's actually there.

Respond with a single JSON object with exactly two fields:
- "copyVariants": an array of 4 objects, each with "headline" (bold, attention-grabbing, max 60 chars), "body" (persuasive, max 150 chars), and "cta" (clear call-to-action, 2-4 words). Make each variant different in angle, tone, and approach. Optimize for the target platforms: ${platformList}.
- "imageSearchQuery": a short (2-5 word) phrase naming ONLY the physical product or subject being advertised, using its exact name if one is given (e.g. "Rhino Hanger tactical hanger", "eco water bottle") — concrete and visual, never the offer, audience, tone, or marketing language.

Respond ONLY with that JSON object. No markdown, no explanation.`;

      // Embed the product photo as a base64 data URL rather than passing its
      // storage URL directly — OpenAI's servers would need to fetch that URL
      // themselves, and a local-dev Supabase URL (or anything behind auth)
      // isn't reachable from OpenAI's side at all.
      let visionImageDataUrl: string | null = null;
      if (imageUrls?.[0]) {
        try {
          const imgResponse = await fetch(toInternalStorageUrl(imageUrls[0], supabaseUrl));
          if (imgResponse.ok) {
            const blob = await imgResponse.blob();
            const mime = blob.type || "image/jpeg";
            visionImageDataUrl = `data:${mime};base64,${await blobToBase64(blob)}`;
          } else {
            console.error(`Could not fetch product image for vision (status ${imgResponse.status})`);
          }
        } catch (e) {
          console.error("Could not fetch/encode product image for vision:", e instanceof Error ? e.message : e);
        }
      }

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              // gpt-4o-mini is vision-capable: when a product photo is provided,
              // let the model actually see it (e.g. to read a name/logo printed
              // on the product) instead of only reading the filename/URL text.
              content: [
                {
                  type: "text",
                  text: `Campaign brief: ${prompt}\n\nUploaded assets: ${assetNames?.length ? assetNames.join(", ") : "none"}\n\nProduct page link(s): ${productUrls?.length ? productUrls.join(", ") : "none"}\n\nGenerate 4 ad copy variants.`,
                },
                ...(visionImageDataUrl ? [{ type: "image_url", image_url: { url: visionImageDataUrl } }] : []),
              ],
            },
          ],
          temperature: 0.8,
          max_tokens: 1000,
        }),
      });

      if (openaiResponse.ok) {
        const openaiData = await openaiResponse.json();
        const content = openaiData.choices?.[0]?.message?.content;
        if (content) {
          // Parse the JSON object (or, for backward compatibility, a bare array) from the response
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          const variantsRaw = Array.isArray(parsed) ? parsed : parsed?.copyVariants;
          if (Array.isArray(variantsRaw)) {
            copyVariants = variantsRaw.slice(0, 4).map((v: Record<string, string>) => ({
              headline: String(v.headline ?? "").slice(0, 60),
              body: String(v.body ?? "").slice(0, 150),
              cta: String(v.cta ?? "Learn More").slice(0, 30),
            }));
          }
          if (!Array.isArray(parsed) && typeof parsed?.imageSearchQuery === "string" && parsed.imageSearchQuery.trim()) {
            imageSearchQuery = parsed.imageSearchQuery.trim();
          }
        }
      } else {
        // Previously silent — a failure here (bad key, no credits, rate limit)
        // fell straight through to the generic hardcoded copy with no trace,
        // which looked like a code bug rather than an OpenAI account issue.
        const errBody = await openaiResponse.text();
        console.error(`OpenAI copy generation failed (status ${openaiResponse.status}): ${errBody.slice(0, 500)}`);
      }
    }

    // Fallback if no OpenAI key or parsing failed
    if (copyVariants.length === 0) {
      const promptWords = prompt.split(" ").slice(0, 6).join(" ");
      copyVariants = [
        {
          headline: `Stop Scrolling. ${promptWords} Starts Here.`,
          body: `Discover what thousands of smart shoppers already know. Limited-time offer — don't miss out on the deal everyone's talking about.`,
          cta: "Shop Now",
        },
        {
          headline: `Your Audience Is Waiting. Are You Ready?`,
          body: `Built for results-driven marketers. Launch high-converting campaigns in minutes, not days. Join the revolution.`,
          cta: "Get Started",
        },
        {
          headline: `The ${promptWords} Revolution Is Here`,
          body: `Don't settle for average. Experience the difference today with our proven, data-backed approach that delivers real ROI.`,
          cta: "Learn More",
        },
        {
          headline: `Unlock ${promptWords} Success Today`,
          body: `Join 10,000+ satisfied customers who transformed their results. Risk-free guarantee. See results in 7 days or your money back.`,
          cta: "Claim Offer",
        },
      ];
    }

    // 2. Produce product images with OpenAI's gpt-image-1 — if a real product
    // photo was uploaded, EDIT that photo (background/scene/lighting/angle
    // only, product itself preserved); otherwise generate from a text prompt
    // as before. Per-variant error handling and the creativeUrls shape below
    // are unchanged either way.
    let creativeUrls: string[] = [];
    const sourceImageUrl = imageUrls?.[0];

    if (openaiKey) {
      const results = await Promise.allSettled(
        sourceImageUrl
          ? [0, 1, 2, 3].map((i) => editProductImage(supabase, publicBaseUrl, supabaseUrl, openaiKey, sourceImageUrl, buildEditPrompt(i)))
          : [0, 1, 2, 3].map((i) => {
              const subject = imageSearchQuery || buildFallbackImageQuery(prompt, assetNames, productUrls);
              return generateProductImage(supabase, publicBaseUrl, openaiKey, buildImageGenPrompt(subject, i));
            })
      );

      creativeUrls = results.map((result, i) => {
        if (result.status === "fulfilled") return result.value;
        // Rate limit, content policy rejection, storage failure, etc. —
        // isolate to this one slot instead of failing the whole request.
        console.error(`Image ${sourceImageUrl ? "edit" : "generation"} failed for variant ${i}:`, result.reason instanceof Error ? result.reason.message : result.reason);
        return placeholderCreative("Image unavailable");
      });
    } else {
      // No OpenAI key configured — no stock-photo fallback anymore, so
      // return neutral placeholders rather than crashing the whole flow.
      creativeUrls = Array.from({ length: 4 }, () => placeholderCreative("Image unavailable"));
    }

    return new Response(
      JSON.stringify({ copyVariants, creativeUrls }),
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
