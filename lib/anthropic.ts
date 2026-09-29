// Thin wrapper around the Anthropic Messages API for estimating food calories/macros,
// classifying/parsing food-or-workout-or-weight-or-period log entries, reading InBody
// screenshots and scale photos, generating on-demand workouts (single-shot or
// conversational), and answering free-form nutrition/fitness questions (the Ask coach).
// Uses fetch directly so we don't need the SDK as a dependency.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

// Best-effort repair for a specific, observed failure mode: the model emits an
// unescaped, literal double-quote character inside a JSON string value (e.g. a
// "decorative" quote around a word, or quoting something someone said) instead
// of escaping it as \". A naive JSON.parse throws immediately on that ("Expected
// ',' or '}' after property value" -- exactly the crash this was built to fix).
// This walks the raw text character by character, tracking whether we're inside
// a string, and when it hits a quote that isn't escaped, it peeks ahead past
// whitespace to decide whether that quote is really closing the string (next
// non-space char is a JSON structural character: , } ] or :) or whether it's a
// stray literal quote embedded mid-string -- in which case it escapes it
// instead of letting it terminate the string early and corrupt the rest of
// the parse.
function repairStrayQuotes(raw: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && inString) {
      out += ch + (raw[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        out += ch;
        continue;
      }
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      const next = raw[j];
      const looksLikeRealClose = next === undefined || [",", "}", "]", ":"].includes(next);
      if (looksLikeRealClose) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

// One raw call to the API -- just the network round trip, returns the first
// real text block. Split out from callClaudeMessages so the retry path below
// can call it twice against different message arrays without duplicating the
// fetch/header/response-shape boilerplate.
async function callOnce(
  messages: { role: "user" | "assistant"; content: any }[],
  maxTokens: number,
  system?: string
): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // The response can include non-text content blocks (e.g. a thinking block)
  // ahead of the actual text block, so grab the first block that's actually
  // type "text" rather than assuming content[0] is it -- content[0] being a
  // thinking block was silently producing an empty {} result.
  const blocks: any[] = Array.isArray(data.content) ? data.content : [];
  const textBlock = blocks.find((b) => b && b.type === "text" && typeof b.text === "string");
  return textBlock?.text ?? "{}";
}

function tryParseJson(text: string): { ok: true; value: any } | { ok: false; candidate: string; err: unknown } {
  const match = text.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : text;
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {
    try {
      return { ok: true, value: JSON.parse(repairStrayQuotes(candidate)) };
    } catch (err) {
      return { ok: false, candidate, err };
    }
  }
}

// Low-level call: takes a full messages array (for multi-turn conversations) plus
// an optional system prompt, and returns the parsed JSON the model was asked to
// respond with.
//
// A long entry (e.g. a whole gala-weekend recap logged in one go) can make the
// model's JSON response longer than max_tokens, so the response gets cut off
// mid-string and JSON.parse throws "Unterminated string in JSON" -- a real crash,
// not something the quote-repair above can fix, since the JSON is genuinely
// incomplete rather than malformed. So on top of the quote-repair, if parsing
// still fails after that, this retries ONCE with an explicit instruction to
// return complete, valid JSON only. Only if that second attempt also fails does
// it throw -- and the thrown error is what the API route surfaces to the UI, so
// callers should catch it and show something friendly rather than crash.
async function callClaudeMessages(
  messages: { role: "user" | "assistant"; content: any }[],
  maxTokens = 800,
  system?: string
) {
  const firstText = await callOnce(messages, maxTokens, system);
  const firstAttempt = tryParseJson(firstText);
  if (firstAttempt.ok) return firstAttempt.value;

  try {
    const retryMessages = [
      ...messages,
      { role: "assistant" as const, content: firstText },
      {
        role: "user" as const,
        content:
          "That wasn't valid, complete JSON -- it looks like it may have been cut off. Return ONLY complete, valid JSON, nothing else. No partial output, no explanation, no text outside the JSON object.",
      },
    ];
    const retryText = await callOnce(retryMessages, maxTokens, system);
    const retryAttempt = tryParseJson(retryText);
    if (retryAttempt.ok) return retryAttempt.value;
    // Cast explicitly rather than relying on control-flow narrowing here --
    // TypeScript doesn't reliably preserve the false-branch narrowing of a
    // discriminated union across this try/catch boundary, which was failing
    // the production type-check build (though not local dev) with "Property
    // 'err' does not exist on type ...".
    const retryFail = retryAttempt as { ok: false; candidate: string; err: unknown };
    throw new Error(
      `Couldn't parse the model's JSON response (${String(retryFail.err)}). Raw response started with: ${retryFail.candidate.slice(0, 300)}`
    );
  } catch (err: any) {
    if (err instanceof Error && err.message.startsWith("Couldn't parse")) throw err;
    // The retry call itself failed (network/API error) rather than producing
    // bad JSON -- surface the original parse failure, which is still the
    // most useful information available. Same explicit-cast reasoning as above.
    const firstFail = firstAttempt as { ok: false; candidate: string; err: unknown };
    throw new Error(
      `Couldn't parse the model's JSON response (${String(firstFail.err)}). Raw response started with: ${firstFail.candidate.slice(0, 300)}`
    );
  }
}

// Single-user-turn convenience wrapper used by all the single-shot estimators below.
async function callClaude(content: any[], maxTokens = 800) {
  return callClaudeMessages([{ role: "user", content }], maxTokens);
}

// Normalizes whatever content-type the browser reports into one of the types
// the Anthropic API accepts. Falls back to jpeg only as a last resort.
function normalizeMediaType(mediaType?: string): string {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (mediaType && allowed.includes(mediaType)) return mediaType;
  return "image/jpeg";
}

// Given a YYYY-MM-DD date string, returns its day-of-week name (e.g. "Monday").
// Parsed as UTC noon rather than midnight local time so this never shifts to
// the adjacent calendar day depending on the server's timezone.
function dayNameForDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
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
    } Give a single best-guess estimate -- don't hedge or give ranges, and don't ask clarifying questions. Never output null for calories, protein_g, carbs_g, or fat_g -- always pick a concrete number, even a rough one. Over time small errors average out, so just estimate like an experienced dietitian eyeballing a plate.

Also estimate nutrition_detail the way a nutrition label would show it -- fiber_g, sugar_g, sodium_mg, saturated_fat_g, cholesterol_mg, potassium_mg. Give your best rough estimate for each rather than defaulting to null; only use null if you truly have no reasonable basis to guess. Respond with ONLY this JSON, no other text: {"description": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "nutrition_detail": {"fiber_g": number | null, "sugar_g": number | null, "sodium_mg": number | null, "saturated_fat_g": number | null, "cholesterol_mg": number | null, "potassium_mg": number | null}}`,
  });

  return callClaude(content);
}

// Reads either a printed InBody result sheet or a smart-scale display/photo.
// Detects which one it's looking at rather than assuming InBody -- Courtney
// wants to be able to snap a quick scale reading too, not just full InBody
// scans, and have it land in the same body_composition history.
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
      text: `This photo is either (a) a printed InBody body composition result sheet, or (b) a bathroom/smart scale display showing a weight reading (and sometimes body fat %). First decide which type of photo this is, then read the values exactly as printed/displayed -- do not estimate or guess if a number is legible. Convert kg to lbs if the reading is in kg. Respond with ONLY this JSON, no other text: {"scan_type": "inbody" | "scale_photo", "weight_lbs": number, "body_fat_pct": number, "skeletal_muscle_mass_lbs": number, "visceral_fat_level": number}. Use null for any value you truly cannot read, or that this photo type simply doesn't show -- a plain scale usually only has weight (and sometimes body fat), so leave skeletal_muscle_mass_lbs and visceral_fat_level null in that case.`,
    },
  ];

  return callClaude(content);
}

// Generates a single on-demand workout from what Courtney has available
// right now -- equipment/location, how long she has, and what she wants to
// focus on. Purely generative, no image involved. Kept as a single-shot
// fallback / building block -- the conversational flow (chatWorkout below)
// is what the workout-generator page actually calls now.
export async function generateWorkout({
  equipment,
  location,
  durationMin,
  focus,
}: {
  equipment?: string;
  location?: string;
  durationMin: number;
  focus?: string;
}) {
  const content: any[] = [
    {
      type: "text",
      text: `Design a single workout for a personal fitness app. Location/equipment available: ${
        location || "not specified"
      }${equipment ? `, equipment: ${equipment}` : ""}. Target duration: about ${durationMin} minutes. Focus: ${
        focus || "general/full body"
      }.

Give a specific, orderable list of exercises with sets/reps or a duration for each (e.g. "3x12 goblet squats" or "5 min jump rope"), grouped into a brief warmup, the main block, and a brief cooldown. Keep it realistic for the stated time and equipment -- never invent equipment that wasn't mentioned as available. Respond with ONLY this JSON, no other text: {"title": string, "estimated_duration_min": number, "warmup": string[], "main": string[], "cooldown": string[], "notes": string}`,
    },
  ];
  const workout = await callClaude(content);
  ensureAbsBlock(workout);
  return workout;
}

// Every generated workout, single-shot or conversational, must include a
// dedicated upper-abs block -- the area between the bust and belly button is
// the one zone Courtney's high-rise pants actually show, so it's a standing
// requirement regardless of the stated focus. The prompt already asks for
// this, but prompt instructions alone aren't reliable enough on their own
// (same lesson as the food-estimate null-guarantee below) -- if the model's
// "main" list doesn't mention abs at all, append a default block as a floor.
function ensureAbsBlock(workout: any) {
  if (!workout || !Array.isArray(workout.main)) return;
  const hasAbs = workout.main.some((item: string) => /\babs?\b|crunch|sit-?up/i.test(item));
  if (!hasAbs) {
    workout.main.push(
      "5 min upper abs -- weighted or cable crunches, focusing on the area between your bust and belly button"
    );
  }
}

// Conversational workout builder -- the workout-generator page is a chat, not
// a form. Courtney just says what she's got ("home gym, 25 minutes, focus on
// my butt") and this either asks one short clarifying question (equipment
// specifics, injuries) or returns the finished workout. `history` is the
// full back-and-forth so far, alternating user/assistant turns; assistant
// turns are the raw JSON this function itself returned on a prior call, so
// the model has full context to adjust a workout Courtney is pushing back on.
export async function chatWorkout(history: { role: "user" | "assistant"; content: string }[]) {
  const system = `You are building a single on-demand workout for Courtney inside her personal fitness app, through a back-and-forth conversation -- she talks to you, there's no form to fill out.

She'll describe what she's got in her own words, e.g. "I'm at my home gym and I want a 25 minute workout focused on my butt." Pull out whatever she's already told you: location/equipment, duration, and focus.

Ask a SHORT clarifying question -- one at a time, conversationally -- ONLY if you genuinely need it to build a safe, sensible workout: for example, what specific equipment she has at a "home gym" or "gym" she mentioned (e.g. does she have a barbell), or whether she has any injuries or pain to work around. Do not ask about anything she's already told you, and never ask more than one question in a single turn. Once you have enough to build something reasonable, just generate the workout -- don't over-clarify or stall.

If she pushes back on a workout you already generated (wants it harder, easier, swap an exercise, more time, etc.), revise it and return a new full workout in the same JSON shape -- don't just describe the change in prose.

Every workout you generate MUST include a dedicated 5-minute upper-abs block as part of "main" -- exercises that specifically target the upper abs (the area between the bust and the belly button: e.g. crunches, sit-ups, cable crunches, weighted crunches), clearly labeled as such. This is a hard requirement on every single workout regardless of the stated focus, because it's the one zone that actually shows in her high-rise pants.

Respond with ONLY JSON, no other text, in exactly one of these two shapes:
- If you need more information: {"type": "question", "question": string}
- If you have enough to build (or revise) the workout: {"type": "workout", "title": string, "estimated_duration_min": number, "warmup": string[], "main": string[], "cooldown": string[], "notes": string}`;

  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const result = await callClaudeMessages(messages, 800, system);
  if (result.type === "workout") ensureAbsBlock(result);
  return result;
}

// Unified classifier for the combined Log screen: given free text and/or a photo,
// decide whether this is a food entry, a workout entry, a weigh-in, or a period/
// cycle note, and extract the relevant fields for whichever it is. Duration for
// workouts is parsed straight out of the text (e.g. "yoga sixty minutes") rather
// than a separate field.
//
// `referenceDate` is the calendar date (YYYY-MM-DD) the entry is being logged
// against by default -- normally "today" in Courtney's own timezone, passed in
// by the route from the same value it already uses as its own fallback. It's
// given to the model as context so it can correctly resolve a day-of-week or
// relative-date mention in the text (e.g. "Sunday: avocado, watermelon..." said
// on a Monday) into an actual calendar date, via the mentioned_date field below,
// instead of everything silently landing on today regardless of what was said.
//
// max_tokens is 2048 here (well above the other estimators' default 800) because
// this is the one call that has to handle a long, multi-part entry typed all at
// once (a whole weekend recap, several drinks and apps and meals in one go) --
// at 800 that JSON response was getting cut off mid-string on exactly that kind
// of entry and crashing the parse. The prompt also now explicitly caps
// `description` to a short summary rather than a verbatim echo of everything
// typed, which keeps the response shorter and avoids duplicating what the person
// just typed back at them.
export async function estimateLogEntry({
  text,
  imageBase64,
  mediaType,
  referenceDate,
}: {
  text?: string;
  imageBase64?: string;
  mediaType?: string;
  referenceDate?: string;
}) {
  const content: any[] = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: normalizeMediaType(mediaType), data: imageBase64 },
    });
  }

  const today = referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
    ? referenceDate
    : new Date().toISOString().slice(0, 10);
  const todayDayName = dayNameForDate(today);

  content.push({
    type: "text",
    text: `You are logging a single entry into a personal fitness/nutrition tracker. The input is one of four things:
- a MEAL/FOOD (e.g. "two eggs and toast", or a photo of food)
- a WORKOUT (e.g. "yoga sixty minutes", "ran 3 miles", "15 min of squats and situps")
- a WEIGH-IN (e.g. "I weighed in at 117 lbs", "117 today", "weight is 116.5", "down to 115")
- a PERIOD/CYCLE note (e.g. "started my period", "period day 2, light flow", "cramps today")
${text ? `The person said: "${text}".` : ""} ${
      imageBase64 ? "A photo is attached -- if it's a photo of food, treat this as a food entry." : ""
    }

For reference, today is ${today} (a ${todayDayName}). This entry is being logged right now, but the person may be describing something from an earlier day -- e.g. they say "Sunday: avocado, watermelon..." while actually talking to you on a Monday, or "yesterday I had..." or "two days ago I did...". If the text names a specific day of the week or a relative day (yesterday, last night, two days ago, etc.), figure out the actual calendar date being referred to -- relative to today -- and put it in "mentioned_date" as YYYY-MM-DD. A bare day-of-week name (e.g. "Sunday") always means the most recent occurrence of that day at or before today, never a future date. If the entry doesn't reference any specific day or relative date at all (it's just describing something happening now), set "mentioned_date" to null -- don't guess a date that wasn't actually implied.

Decide which of the four types it is, then extract fields for that type only -- leave every field for the other types null.

IMPORTANT -- keep "description" short: it must be a brief summary (roughly 100 characters or fewer), never a verbatim transcript of everything the person typed. This matters most on long, rambling, or multi-part entries (e.g. a whole weekend recap) -- summarize the gist ("Gala weekend: apps, wine, champagne") rather than repeating it back word for word. A short description also keeps your JSON response itself shorter, which matters for long entries.

For FOOD: always give a single best-guess calorie/macro estimate, like an experienced dietitian eyeballing a plate or a casual description. Never return null for calories/protein/carbs/fat once you've decided the entry is food -- always pick a concrete number, even a rough one, no matter how vague, long, or rambling the description is. If the entry covers multiple foods/drinks across one sitting or one day (e.g. several appetizers plus multiple glasses of wine at a gala), add up a single combined total for calories/protein/carbs/fat rather than trying to itemize -- one row, one honest total. Only count food already eaten; ignore anything the person says they're about to eat or plan to eat later -- do not let a mention of future food push you toward returning null, just estimate the part that was actually eaten. Example: "I just ate a fun size Twix and I'm probably gonna go to sushi later" -> this is a food entry for the Twix ONLY (roughly 80 calories, 1g protein, 10g carbs, 4g fat) -- the sushi is not eaten yet, so it's ignored entirely, but you still must output real numbers, not null. If the text truly contains no food that was eaten, it is not a food entry -- reconsider whether it's actually a weigh-in, workout, or period note instead. Also estimate nutrition_detail (fiber_g, sugar_g, sodium_mg, saturated_fat_g, cholesterol_mg, potassium_mg) the way a nutrition label would show it -- give your best rough estimate rather than defaulting to null.

For WORKOUT: parse the duration in minutes directly out of what was said if a time is mentioned (e.g. "sixty minutes" -> 60); if no duration was mentioned, use null.

For WEIGH-IN: extract the number as weight_lbs. Assume pounds unless a unit like kg is explicitly stated, and convert to lbs if so.

For PERIOD: extract flow (e.g. "light", "medium", "heavy") if mentioned, else null, and put the raw note in period_notes.

Respond with ONLY this JSON, no other text: {"type": "food" | "workout" | "weight" | "period", "description": string, "mentioned_date": string | null, "calories": number | null, "protein_g": number | null, "carbs_g": number | null, "fat_g": number | null, "nutrition_detail": {"fiber_g": number | null, "sugar_g": number | null, "sodium_mg": number | null, "saturated_fat_g": number | null, "cholesterol_mg": number | null, "potassium_mg": number | null} | null, "workout_type": string | null, "duration_min": number | null, "weight_lbs": number | null, "flow": string | null, "period_notes": string | null}`,
  });

  const result = await callClaude(content, 2048);

  // Defensive: only trust mentioned_date if it's actually a well-formed
  // YYYY-MM-DD string and not in the future -- a malformed or future value
  // from the model should just be treated as "no date mentioned" rather than
  // silently corrupting where the entry gets logged.
  if (
    typeof result.mentioned_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(result.mentioned_date) ||
    result.mentioned_date > today
  ) {
    result.mentioned_date = null;
  }

  // The route that consumes this only special-cases "workout", "weight", and
  // "period" -- anything else lands in the food table. So the guarantee below
  // has to use that same rule, not a strict `=== "food"` check. On confusing
  // inputs the classifier has been observed to return a type value that isn't
  // exactly "food" (whitespace, a slightly different word, etc.) while still
  // not being a workout/weigh-in/period entry -- if we only checked
  // `=== "food"`, those entries would slip through with null calories
  // untouched. Normalizing to "food" here keeps this function's output and
  // the route's insert logic in sync no matter what the classifier actually
  // returned.
  if (result.type !== "workout" && result.type !== "weight" && result.type !== "period") {
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
    result.nutrition_detail = result.nutrition_detail ?? retry.nutrition_detail ?? null;
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

// The "Ask" coach -- a free-form nutrition/fitness Q&A that NEVER logs
// anything. This is deliberately its own function (plain text out, not JSON)
// so a question like "brown rice or white rice?" gets answered conversationally
// instead of being forced through the log-entry classifier and recorded as food.
export async function coachAnswer({
  messages,
  context,
}: {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: string;
}): Promise<string> {
  const system = `You are a warm, practical nutrition and fitness coach living inside Courtney's personal health app. She is tracking her weight, body fat %, skeletal muscle mass, workouts, and daily calories, working toward gradual fat loss while keeping and building muscle.

Answer her questions directly and conversationally, like a knowledgeable friend texting back -- usually 2 to 5 sentences unless she asks for more. Always give a clear recommendation instead of hedging (e.g. if she asks "brown rice or white rice?", pick one and say why). Be encouraging, never preachy. This is general wellness guidance, not medical advice. Never output JSON, never say you logged anything -- you are only here to talk.${
    context ? `\n\nContext about her day (use only if relevant, don't recite it): ${context}` : ""
  }`;

  const text = await callOnce(messages, 700, system);
  return text || "Sorry, I didn't catch that -- try again.";
}
