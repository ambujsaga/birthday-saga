# Server-Side Hourly Question Generator — Setup Guide

Yeh naya `functions/index.js` aapke Firebase project ke server par chalta hai
— admin ka browser tab khula rakhna zaroori nahi. Yeh **purane admin panel
(challenge-admin.html) ke kisi bhi feature/button ko todta nahi** — bas usi
ke saath extra reliability layer hai.

## Ek baar ka setup

1. **Firebase project Blaze plan par hona chahiye.**
   Scheduled Cloud Functions aur bahar (OpenRouter) ko network call karne ke
   liye Blaze (pay-as-you-go) plan zaroori hai — Free/Spark plan se nahi chalega.
   Firebase Console → Project Settings → Usage and billing → Upgrade to Blaze.

2. **Firebase CLI install/login** (apne computer par, ek baar):
   ```
   npm install -g firebase-tools
   firebase login
   ```

3. **Project folder me `functions/` daalein:**
   - Agar aapke project me pehle se `firebase.json` / `functions/` folder
     NAHI hai: `firebase init functions` chalayein, "Use an existing project"
     choose karke `mmitsce` select karein, JavaScript choose karein.
   - Fir is chat se diye gaye `functions/index.js` aur `functions/package.json`
     ko apne `functions/` folder me copy/replace kar dein.
   - Agar pehle se `functions/` folder maujood hai, to bas yeh do files
     usi folder me copy/replace kar dein (baaki files ko chhede bina).

4. **Dependencies install karein:**
   ```
   cd functions
   npm install
   ```

5. **Deploy karein:**
   ```
   firebase deploy --only functions:autoGenerateHourlyChallenge
   ```
   Pehli baar deploy karte waqt Firebase Cloud Scheduler aur Cloud Build APIs
   khud-ba-khud enable karne ko bolega — "Yes"/allow kar dein.

## Yeh kaam kaise karta hai

- Har ghante ke start (0th minute, IST) par yeh function Google ke server par
  khud chalta hai.
- Wahi settings use karta hai jo admin panel ke "AI Auto-Generate Mode" box
  me save hoti hain (`portal/engagement/aiConfig` — key/model/xp/running).
- Agar admin panel me "Start AI Auto Mode" ON hai (`running: true`), tabhi
  yeh generate karta hai — Stop dabane par yeh bhi ruk jaata hai.
- Agar us ghante ka question pehle se maujood hai (manually ya kisi aur
  tareeke se), to use overwrite NAHI karta.
- Result wahi jagah publish hota hai jahan pehle hota tha
  (`portal/engagement/dailyChallenge/<date>-<hour>`), aur status
  `aiConfig/lastStatus` me update hota hai — admin panel me turant dikhega.

## Purana browser-tab-wala auto mode

Wo bilkul waisa hi chalta rehta hai — kisi ne agar tab khula rakha to wo bhi
generate karega (dono milkar kaam karte hain; duplicate publish nahi hota
kyunki dono "already exists" check karte hain / same key overwrite karte hain).
Admin panel ke Start/Stop, Generate Now, Save Settings, manual Publish
Challenge — sab kuchh bilkul pehle jaisa hi kaam karta hai.
