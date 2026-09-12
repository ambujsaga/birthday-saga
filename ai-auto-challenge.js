// Yeh script GitHub Actions ke schedule se chalti hai — Firebase Cloud
// Functions/Blaze ki zaroorat nahi. GitHub ke apne free server par chalti
// hai, isliye admin panel band ho ya phone off ho, farak nahi padta.
//
// Kaam: database me 'portal/engagement/aiConfig' check karta hai. Agar
// running=true hai aur interval ka time pura ho chuka hai, OpenRouter se
// naya question generate karke aaj ki date ke slot me publish kar deta hai.

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://mmitsce-default-rtdb.firebaseio.com"
});

const db = admin.database();
const AI_CONFIG_PATH = "portal/engagement/aiConfig";
const AI_DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

function pad2(n) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function buildPrompt() {
  return "You generate one Computer Science / General Engineering multiple-choice quiz question for college students. "
    + "Reply with ONLY raw JSON, no markdown, no code fences, no extra text, in this exact shape: "
    + '{"question":"...","options":["...","...","...","..."],"correct":0}. '
    + '"options" must have exactly 4 short items. "correct" is the 0-based index of the correct option. '
    + "Pick a different topic each time (DSA, OS, DBMS, networks, OOP, aptitude, current tech).";
}

async function callOpenRouterOnce(key, model) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
      "HTTP-Referer": "https://mmitsce.firebaseapp.com",
      "X-Title": "MMITcs Daily Challenge Auto"
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: buildPrompt() }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("API error " + res.status + ": " + errText.slice(0, 200));
  }

  const data = await res.json();
  let raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  raw = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(raw); // invalid JSON => throws, caller retries

  const question = String(parsed.question || "").trim();
  const options = (parsed.options || []).map((o) => String(o).trim());
  const correct = parseInt(parsed.correct, 10);

  if (!question || options.length !== 4 || options.some((o) => !o) || isNaN(correct) || correct < 0 || correct > 3) {
    throw new Error("AI response incomplete/invalid shape");
  }
  return { question, options, correct };
}

async function main() {
  const snap = await db.ref(AI_CONFIG_PATH).once("value");
  const cfg = snap.val();

  if (!cfg || !cfg.running || !cfg.key) {
    console.log("AI mode OFF ya config missing — kuch nahi karna.");
    process.exit(0);
  }

  const intervalMs = (cfg.intervalMinutes || 1) * 60000;
  const now = Date.now();
  const lastRun = cfg.lastRun || 0;
  if (now - lastRun < intervalMs) {
    console.log("Abhi due nahi hai, skip.");
    process.exit(0);
  }

  const model = cfg.model || AI_DEFAULT_MODEL;
  const xp = cfg.xp || 10;

  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { question, options, correct } = await callOpenRouterOnce(cfg.key, model);
      await db.ref("portal/engagement/dailyChallenge/" + todayStr()).set({
        question, options, correct, xp, ts: Date.now(), source: "ai"
      });
      await db.ref(AI_CONFIG_PATH).update({
        lastRun: Date.now(),
        lastStatus: "✅ (background) Published: " + question.slice(0, 60)
      });
      console.log("Published:", question);
      process.exit(0);
    } catch (e) {
      lastErr = e;
      if (String(e.message).includes("API error")) break;
    }
  }

  await db.ref(AI_CONFIG_PATH).update({
    lastRun: Date.now(),
    lastStatus: "⚠️ (background) failed: " + (lastErr ? lastErr.message : "unknown error")
  });
  console.error("Failed:", lastErr ? lastErr.message : "unknown error");
  process.exit(0);
}

main();
