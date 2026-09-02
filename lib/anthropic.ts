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
    } Give a single best-guess estimate -- don't hedge or give ranges, and don't ask clarifying questions. Over time small errors average out, so just estimate like an experienced dietitian eyeballing a plate. Respond with ONLY this JSON, no other text: {"description": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}`,
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

For FOOD: always give a single best-guess calorie/macro estimate, like an experienced dietitian eyeballing a plate or a casual description -- never return null for calories/protein/carbs/fat on a food entry, even if the description is vague, conversational, or rambling. Only count food already eaten, not food they mention they're about to eat later. If the text truly contains no food that was eaten, it is not a food entry -- reconsider whether it's actually a weigh-in or workout instead.

For WORKOUT: parse the duration in minutes directly out of what was said if a time is mentioned (e.g. "sixty minutes" -> 60); if no duration was mentioned, use null.

For WEIGH-IN: extract the number as weight_lbs. Assume pounds unless a unit like kg is explicitly stated, and convert to lbs if so.

Respond with ONLY this JSON, no other text: {"type": "food" | "workout" | "weight", "description": string, "calories": number | null, "protein_g": number | null, "carbs_g": number | null, "fat_g": number | null, "workout_type": string | null, "duration_min": number | null, "weight_lbs": number | null}`,
  });

  return callClaude(content);
}
