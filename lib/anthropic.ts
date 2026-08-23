// Thin wrapper around the Anthropic Messages API for estimating food calories/macros
// and reading InBody screenshots. Uses fetch directly so we don't need the SDK as a dependency.

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

export async function estimateFood({
  description,
  imageBase64,
}: {
  description?: string;
  imageBase64?: string;
}) {
  const content: any[] = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
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

export async function estimateBodyScan({ imageBase64 }: { imageBase64: string }) {
  const content: any[] = [
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
    },
    {
      type: "text",
      text: `This is a photo of an InBody body composition result sheet. Read the printed values exactly as shown -- do not estimate or guess if a number is legible. Respond with ONLY this JSON, no other text: {"weight_lbs": number, "body_fat_pct": number, "skeletal_muscle_mass_lbs": number, "visceral_fat_level": number}. Use null for any value you truly cannot read.`,
    },
  ];

  return callClaude(content);
}
