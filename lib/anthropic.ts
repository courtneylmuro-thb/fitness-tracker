// Thin wrapper around the Anthropic Messages API for estimating food calories/macros,
// classifying/parsing food-or-workout-or-weight log entries, and reading InBody screenshots.
// Uses fetch directly so we don't need the SDK as a dependency.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

async function callClaude(content: any[]) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

// Normalizes whatever content-type the browser reports into one of the types
// the Anthropic API accepts. Falls back to jpeg only as a last resort.
function normalizeMediaType(mediaType?: string): string {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (mediaType && allowed.includes(mediaType)) return mediaType;
  return "image/jpeg";
}

export async function estimateFood({
  description,
  imageBase64,
  mediaType,
}: {
  description?: string;
  imageBase64?: string;
  mediaType?: string;
}) {
  const content: any[] = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: normalizeMediaType(mediaType), data: imageBase64 },
    });
  }
  content.push({
    type: "text",
    text: `You are estimating calories and macros for a personal food log. ${
      description ? `The person said: "${description}".` : "A photo of the food is attached."
    } Give a single best-guess estimate -- don't hedge or give ranges, and don't ask clarifying questions. Never output null for calories, protein_g, carbs_g, or fat_g -- always pick a concrete number, even a rough one. Over time small errors average out, so just estimate like an experienced dietitian eyeballing a plate. Respond with ONLY this JSON, no other text: {"description": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}`,
  });

  return callClaude(content);
}

export async function estimateBodyScan({
  imageBase64,
  mediaType,
}: {
  imageBase64: string;
  mediaType?: string;
}) {
  const content: any[] = [
    {
      type: "image",
      source: { type: "base64", media_type: normalizeMediaType(mediaType), data: imageBase64 },
    },
    {
      type: "text",
      text: `This is a photo of an InBody body composition result sheet. Read the printed values exactly as shown -- do not estimate or guess if a number is legible. Respond with ONLY this JSON, no other text: {"weight_lbs": number, "body_fat_pct": number, "skeletal_muscle_mass_lbs": number, "visceral_fat_level": number}. Use null for any value you truly cannot read.`,
    },
  ];

  return callClaude(content);
}

// Unified classifier for the combined Log screen: given free text and/or a photo,
// decide whether this is a food entry, a workout entry, or a weigh-in, and
// extract the relevant fields for whichever it is. Duration for workouts is
// parsed straight out of the text (e.g. "yoga sixty minutes") rather than a
// separate field.
export async function estimateLogEntry({
  text,
  imageBase64,
  mediaType,
}: {
  text?: string;
  imageBase64?: string;
  mediaType?: string;
}) {
  const content: any[] = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: normalizeMediaType(mediaType), data: imageBase64 },
    });
  }
  content.push({
    type: "text",
    text: `You are logging a single entry into a personal fitness/nutrition tracker. The input is one of three things:
- a MEAL/FOOD (e.g. "two eggs and toast", or a photo of food)
- a WORKOUT (e.g. "yoga sixty minutes", "ran 3 miles", "15 min of squats and situps")
- a WEIGH-IN (e.g. "I weighed in at 117 lbs", "117 today", "weight is 116.5", "down to 115")
${text ? `The person said: "${text}".` : ""} ${
      imageBase64 ? "A photo is attached -- if it's a photo of food, treat this as a food entry." : ""
    }

Decide which of the three types it is, then extract fields for that type only -- leave every field for the other two types null.

For FOOD: always give a single best-guess calorie/macro estimate, like an experienced dietitian eyeballing a plate or a casual description. Never return null for calories/protein/carbs/fat once you've decided the entry is food -- always pick a concrete number, even a rough one, no matter how vague or rambling the description is. Only count food already eaten; ignore anything the person says they're about to eat or plan to eat later -- do not let a mention of future food push you toward returning null, just estimate the part that was actually eaten. Example: "I just ate a fun size Twix and I'm probably gonna go to sushi later" -> this is a food entry for the Twix ONLY (roughly 80 calories, 1g protein, 10g carbs, 4g fat) -- the sushi is not eaten yet, so it's ignored entirely, but you still must output real numbers, not null. If the text truly contains no food that was eaten, it is not a food entry -- reconsider whether it's actually a weigh-in or workout instead.

For WORKOUT: parse the duration in minutes directly out of what was said if a time is mentioned (e.g. "sixty minutes" -> 60); if no duration was mentioned, use null.

For WEIGH-IN: extract the number as weight_lbs. Assume pounds unless a unit like kg is explicitly stated, and convert to lbs if so.

Respond with ONLY this JSON, no other text: {"type": "food" | "workout" | "weight", "description": string, "calories": number | null, "protein_g": number | null, "carbs_g": number | null, "fat_g": number | null, "workout_type": string | null, "duration_min": number | null, "weight_lbs": number | null}`,
  });

  const result = await callClaude(content);

  // The route that consumes this only special-cases "workout" and "weight" --
  // anything else lands in the food table. So the guarantee below has to use
  // that same rule, not a strict `=== "food"` check. On confusing inputs the
  // classifier has been observed to return a type value that isn't exactly
  // "food" (whitespace, a slightly different word, etc.) while still not
  // being a workout or weigh-in -- if we only checked `=== "food"`, those
  // entries would slip through with null calories untouched. Normalizing to
  // "food" here keeps this function's output and the route's insert logic in
  // sync no matter what the classifier actually returned.
  if (result.type !== "workout" && result.type !== "weight") {
    result.type = "food";
    await ensureFoodNumbers(result, { imageBase64, mediaType }, text);
  }

  return result;
}

// Guarantees a food entry never leaves this file with a null calorie/macro
// value, no matter how the model behaves on a given input. Tries the plain
// food estimator first (different prompt, sometimes succeeds where the
// classifier didn't), then a maximally blunt forced-guess prompt, and
// finally falls back to a fixed generic-snack estimate as an absolute floor.
// This is a deliberate belt-and-suspenders design: prompt instructions alone
// ("never return null") are not reliable enough on their own -- this has been
// observed to fail in production on real entries.
async function ensureFoodNumbers(
  result: any,
  media: { imageBase64?: string; mediaType?: string },
  originalText?: string
) {
  if (result.calories !== null && result.calories !== undefined) return;

  try {
    const retry = await estimateFood({
      description: result.description || originalText,
      imageBase64: media.imageBase64,
      mediaType: media.mediaType,
    });
    result.calories = retry.calories ?? result.calories;
    result.protein_g = retry.protein_g ?? result.protein_g;
    result.carbs_g = retry.carbs_g ?? result.carbs_g;
    result.fat_g = retry.fat_g ?? result.fat_g;
    result.description = result.description || retry.description;
  } catch {
    // Anthropic API error on retry -- fall through to the next attempt.
  }

  if (result.calories !== null && result.calories !== undefined) return;

  try {
    const content: any[] = [];
    if (media.imageBase64) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: normalizeMediaType(media.mediaType), data: media.imageBase64 },
      });
    }
    content.push({
      type: "text",
      text: `Food log entry: "${result.description || originalText || "unspecified food"}". You must output a specific number for every field below. Do not output null under any circumstances, even if you are unsure what the food is or how much of it was eaten -- if genuinely unidentifiable, use a generic estimate for one typical serving of a snack (roughly 150-250 calories). Respond with ONLY this JSON, no other text: {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}`,
    });
    const forced = await callClaude(content);
    result.calories = forced.calories ?? result.calories;
    result.protein_g = forced.protein_g ?? result.protein_g;
    result.carbs_g = forced.carbs_g ?? result.carbs_g;
    result.fat_g = forced.fat_g ?? result.fat_g;
  } catch {
    // Anthropic API error on forced retry -- fall through to the hard floor.
  }

  if (result.calories !== null && result.calories !== undefined) return;

  // Absolute floor: if the model has refused twice, don't leave the entry
  // blank. A rough generic-snack estimate is far more useful than "--".
  result.calories = 200;
  result.protein_g = result.protein_g ?? 5;
  result.carbs_g = result.carbs_g ?? 22;
  result.fat_g = result.fat_g ?? 8;
}
