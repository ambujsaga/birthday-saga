/**
 * MMITcs Daily Challenge — SERVER-SIDE AI Auto-Generator
 * ---------------------------------------------------------
 * Yeh Cloud Function Google ke server par har 1 hour me AUTOMATICALLY chalta hai
 * (Cloud Scheduler ke zariye) — admin ka browser tab khula rakhna ab zaroori
 * nahi hai. challenge-admin.html ka purana "AI Auto Mode" (browser-tab-based
 * timer) bilkul waisa hi rehne diya gaya hai, yeh sirf ek extra/behtar layer hai.
 *
 * Kaam kaise karta hai:
 *  1. Har ghante ke start me trigger hota hai.
 *  2. Firebase se 'portal/engagement/aiConfig' padhta hai (wahi settings jo
 *     admin panel ke "AI Auto-Generate Mode" box me save ki jaati hain — key,
 *     model, xp, running flag).
 *  3. Agar cfg.running === false ho, ya API key na ho, to kuchh nahi karta.
 *  4. Agar us ghante (hourKey) ke liye challenge PEHLE SE hi maujood hai
 *     (chahe admin ne manually daala ho ya kisi aur tareeke se), to use
 *     OVERWRITE nahi karta — sirf khaali ghanto ke liye naya question banata hai.
 *  5. OpenRouter API se, sirf fixed SYLLABUS se, ek MCQ generate karta hai
 *     (bilkul wahi prompt jo admin panel use karta hai) aur Firebase par
 *     'portal/engagement/dailyChallenge/<hourKey>' par publish kar deta hai.
 *  6. 'portal/engagement/aiConfig/lastStatus' bhi update karta hai, taaki admin
 *     panel me status turant dikh jaaye.
 *
 * Users (students) ko kuchh bhi nahi pata chalta — unhe bas testing.html
 * (student portal) par har ghante naya question apne aap dikhta rahega.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

const AI_CONFIG_PATH = "portal/engagement/aiConfig";
const CHALLENGE_PATH = "portal/engagement/dailyChallenge";
const AI_DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

// Admin panel (challenge-admin.html) jaisa hi fixed syllabus — copy-paste rakhein
// taaki dono jagah SAME topics se hi questions banein. Agar syllabus badlein,
// to yahan aur challenge-admin.html dono jagah update karein.
const SYLLABUS_TEXT = `
1. Mathematics-I
- Unit 1: Trigonometry — Angles and Measurement, Degree and Radian, T-ratios, Allied Angles, Sum and Difference Formula, Product Formula, Multiple and Sub-multiple Angles, Graphs: |x|, sin x, cos x, e^x
- Unit 2: Differential Calculus — Function, Limits, Standard Limits, Differentiation, Differentiation Rules, Trigonometric Functions, Logarithmic Differentiation, Exponential Functions
- Unit 3: Partial Fractions — Polynomial Fraction, Proper and Improper Fraction, Partial Fractions, Linear Factors, Repeated Linear Factors
- Unit 4: Binomial Theorem — nPr and nCr, Binomial Theorem, Expansion, General Term, Middle Term, Independent Term
- Unit 5: Complex Numbers — Real and Imaginary Parts, Cartesian Form, Polar Form, Conjugate, Modulus, Amplitude, Operations on Complex Numbers, De Moivre's Theorem

2. Applied Physics-I
- Unit 1: Units and Dimensions
- Unit 2: Force and Motion
- Unit 3: Work, Power and Energy
- Unit 4: Circular Motion
- Unit 5: Rotational Motion of a Rigid Body
- Unit 6: Properties of Matter
- Unit 7: Heat and Thermometry
- Practical: Vernier Calipers, Screw Gauge, Spherometer, Simple Pendulum, Parallelogram Law of Forces, Coefficient of Friction, Viscosity, Conservation of Mechanical Energy, Mercury Thermometer, Hooke's Law

3. IT & AI
- Introduction to Information Technology, Computer Fundamentals, Basic Computer Components, Hardware and Software, Operating System, Internet and Web, Basic Networking, Information Technology Applications, Introduction to Artificial Intelligence, AI Basics and Concepts, Applications of AI

4. Communication Skills in English
- Unit 1: Communication — Basics of Communication, Communication Process, Formal and Informal Communication, Verbal and Non-verbal Communication, 7 Cs of Communication, Barriers of Communication
- Unit 2: Soft Skills — Soft Skills, Hard Skills, Importance of Soft Skills
- Unit 3: Reading Comprehension — Unseen Passage, Questions and Answers, Prefix and Suffix, Synonyms, Antonyms
- Unit 4: Functional Grammar — Sentences and Types, Parts of Speech, Tenses, Active and Passive Voice, Punctuation
- Unit 5: Professional Writing — CV/Resume, Cover Letter, Agenda, Minutes, Notice, Official Letter, Memo, Circular, Office Order, Report, Email

5. Engineering Workshop Practice
- Carpentry Shop: Woodworking Tools, Planing, Marking, Chiselling, Grooving, Turning, Wood Joints
- Fitting Shop: Fitting Tools, Filing, Drilling, Tapping, Sawing, Cutting, Marking, Hacksawing
- Welding Shop: Welding Tools, Arc Welding, Gas Welding, MIG Welding, Gas Cutting, Butt Joint, Lap Joint, T-Joint
- Sheet Metal Shop: Cutting, Bending, Edging, End Curling, Lancing, Soldering, Brazing, Riveting, Seam Joints, Cylinders
- Plumbing Shop: Plumbing Tools, Pipes and Fittings, Valves, GI/PVC Pipe Joints, Pipe Cutting, Threading, Pipe Fitting
- Painting & Polishing: Paints, Varnishes, Surface Preparation, Primer, Painting of Wood, Painting of Metal, Electroplating
`.trim();

function pad2(n) {
  return String(n).padStart(2, "0");
}

// IST (Asia/Kolkata) ke hisaab se hourKey banata hai — admin panel/testing.html
// dono IST hi use karte hain, isliye function ka timeZone bhi neeche IST set kiya gaya hai.
function hourKeyIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = ist.getFullYear();
  const m = pad2(ist.getMonth() + 1);
  const d = pad2(ist.getDate());
  const h = pad2(ist.getHours());
  return `${y}-${m}-${d}-${h}`;
}

function buildPrompt() {
  return (
    "You are a quiz-question generator for first-year diploma/engineering students. " +
    "You must generate ONE multiple-choice question STRICTLY AND ONLY from the syllabus given below. " +
    "Do NOT use any topic, concept, or example that is not explicitly listed in this syllabus — no outside knowledge, " +
    "no unrelated subjects, no made-up or general \"computer science trivia\" topics. Every question must map to a specific " +
    "unit/topic line from the syllabus text.\n\n" +
    "=== SYLLABUS (the ONLY allowed source of topics) ===\n" +
    SYLLABUS_TEXT +
    "\n=== END OF SYLLABUS ===\n\n" +
    "Pick ONE topic line from the syllabus above (rotate randomly across the 5 subjects and their units so questions " +
    "don't repeat the same subject every time), and write one clear, exam-style multiple-choice question on it. " +
    'Reply with ONLY raw JSON, no markdown, no code fences, no extra text, in this exact shape: ' +
    '{"question":"...","options":["...","...","...","..."],"correct":0}. ' +
    '"options" must have exactly 4 short items. "correct" is the 0-based index of the correct option.'
  );
}

async function callOpenRouterOnce(key, model) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
      "HTTP-Referer": "https://mmitsce.firebaseapp.com",
      "X-Title": "MMITcs Daily Challenge Server Auto-Generator",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildPrompt() }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("API error " + res.status + ": " + errText.slice(0, 200));
  }

  const data = await res.json();
  let raw =
    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  raw = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(raw); // throws if invalid — caught by caller for retry

  const question = String(parsed.question || "").trim();
  const options = (parsed.options || []).map((o) => String(o).trim());
  const correct = parseInt(parsed.correct, 10);

  if (!question || options.length !== 4 || options.some((o) => !o) || isNaN(correct) || correct < 0 || correct > 3) {
    throw new Error("AI response incomplete/invalid shape");
  }
  return { question, options, correct };
}

async function generateAndPublish() {
  const cfgSnap = await db.ref(AI_CONFIG_PATH).get();
  const cfg = cfgSnap.val() || {};

  if (!cfg.running) {
    logger.info("AI Auto Mode is OFF (aiConfig.running=false) — skipping this hour.");
    return;
  }
  if (!cfg.key) {
    logger.warn("No API key saved in aiConfig — skipping.");
    return;
  }

  const period = hourKeyIST();

  // Agar is ghante ka challenge pehle se maujood hai (admin ne manually daala ho,
  // ya kisi wajah se pehle hi ban chuka ho), to overwrite mat karo.
  const existingSnap = await db.ref(CHALLENGE_PATH + "/" + period).get();
  if (existingSnap.exists()) {
    logger.info(`Challenge already exists for ${period} — not overwriting.`);
    return;
  }

  const model = cfg.model || AI_DEFAULT_MODEL;
  const xp = parseInt(cfg.xp, 10) || 10;

  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { question, options, correct } = await callOpenRouterOnce(cfg.key, model);
      await db.ref(CHALLENGE_PATH + "/" + period).set({
        question,
        options,
        correct,
        xp,
        ts: Date.now(),
        source: "ai-server",
      });
      const statusMsg =
        "✅ [Server] Published for " +
        period +
        " at " +
        new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
        ' — "' +
        question.slice(0, 60) +
        (question.length > 60 ? "…" : "") +
        '"';
      await db.ref(AI_CONFIG_PATH + "/lastStatus").set(statusMsg);
      logger.info(statusMsg);
      return;
    } catch (e) {
      lastErr = e;
      logger.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e.message}`);
      if (String(e.message).includes("API error")) break;
    }
  }

  const errMsg = "⚠️ [Server] " + MAX_ATTEMPTS + " attempts ke baad bhi fail: " + (lastErr && lastErr.message);
  await db.ref(AI_CONFIG_PATH + "/lastStatus").set(errMsg);
  logger.error(errMsg);
}

// Har ghante ke 0th minute par (IST) khud-ba-khud chalta hai.
exports.autoGenerateHourlyChallenge = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    retryCount: 2,
  },
  async (event) => {
    await generateAndPublish();
  }
);
