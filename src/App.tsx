import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface WarmupItem {
  name: string;
  duration: string;
  cue: string;
}

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  note: string;
  // Unilateral exercises track the weaker side first.
  unilateral?: boolean;
}

// A skill exercise (pistol progression) tracked left/right separately.
// Box Pistol additionally tracks box height (the primary progression variable)
// and an optional counterbalance weight.
interface SkillExercise {
  name: string;
  sets: number;
  reps: string;          // target, e.g. "10/side" or "6/side"
  note: string;
  hasBox?: boolean;      // show box-height field
  hasCounterbalance?: boolean; // show counterbalance-weight field
}

// A tracked "PR-style" exercise on the progression block: log a single value
// per set (either a hold duration or reps), left/right when unilateral.
interface TrackedExercise {
  name: string;
  sets: number;
  target: string;        // display target, e.g. "R 50s / L 45s"
  note: string;
  unilateral?: boolean;  // log L and R separately
  metric: "time" | "reps" | "weight"; // logged value type; "weight" = weight × reps
}

interface PoolExercise {
  name: string;
  cue: string;
}

interface PoolCategories {
  [category: string]: PoolExercise[];
}

type DayKind = "foundational" | "progression" | "mobility";

interface ProgramDay {
  id: number;
  title: string;
  subtitle: string;
  color: string;
  kind: DayKind;
  warmup: string[];
  exercises: Exercise[];
  pm: WarmupItem[];
  pool?: PoolCategories;
  // Progression-block days:
  skill?: SkillExercise[];
  tracked?: TrackedExercise[];
  progressionNote?: string;
  // Mobility days:
  coreCalf?: Exercise[];
  optionalSkill?: SkillExercise[];
}

// A logged set. weight/reps are used for standard (bilateral) exercises.
// The optional *L/*R fields are used for unilateral & skill exercises, and
// box/counterbalance for box-pistol work. All optional so historical records
// that only have {weight, reps} still parse.
interface SetData {
  weight: string;
  reps: string;
  weightL?: string;
  repsL?: string;
  weightR?: string;
  repsR?: string;
  boxHeight?: string;      // inches
  counterbalance?: string; // lb
  valueL?: string;         // tracked-exercise value (time/reps), left side
  valueR?: string;         // tracked-exercise value, right side
  value?: string;          // tracked-exercise value, bilateral
}

// { "exIdx-setNum": SetData }
interface DayLogs {
  [key: string]: SetData;
}

// { "YYYY-MM-DD|programIdx": DayLogs }
interface AllLogs {
  [dayKey: string]: DayLogs;
}

// { "YYYY-MM-DD": { "Exercise Name": boolean } }
interface CoreLogs {
  [date: string]: { [exerciseName: string]: boolean };
}

// { "YYYY-MM-DD|programIdx": { "ex-N": string, "workout": string } }
interface NotesLogs {
  [dayKey: string]: { [noteKey: string]: string };
}

interface FreqMap {
  [exerciseName: string]: number;
}

interface WeekDay {
  short: string;
  dayIndex: number;
}

interface RestTip {
  label: string;
  body: string;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

// v2: the 2026-09-30 program rebuild changed the day mapping (Tue moved from Pull
// to the Progression Block) AND changed the exercise list on every day. Logs are
// keyed positionally ("YYYY-MM-DD|programIdx" → "exIdx-setNum"), so reusing the v1
// namespace would silently remap every historical record onto a different exercise.
// To protect history we write the new program to fresh v2 keys and leave v1 data
// untouched. The v1 logs are still surfaced (read-only) in the export, labeled with
// a frozen snapshot of the v1 program so old numbers stay attached to the exercise
// they were actually recorded for.
const STORAGE_KEY = "eli_workout_logs_v2";
const CORE_LOG_KEY = "eli_core_logs_v2";
const WARMUP_LOG_KEY = "eli_warmup_logs_v2";
const NOTES_LOG_KEY = "eli_notes_logs_v2";
const NOTIF_PERM_KEY = "eli_notif_permission";

// Legacy (pre-2026-09-30) storage keys — read only, for exporting past history.
const LEGACY_STORAGE_KEY = "eli_workout_logs_v1";
const LEGACY_NOTES_LOG_KEY = "eli_notes_logs_v1";

// Frozen snapshot of the v1 program's day titles + exercise names, in the exact
// index order they were stored under. Used ONLY to label historical v1 logs on
// export so weights render against the correct exercise. Do not edit — this must
// match the program as it existed when the v1 logs were written.
const LEGACY_PROGRAM: { title: string; exercises: string[] }[] = [
  { title: "PUSH DAY", exercises: ["Flat Barbell Bench", "Incline DB Press", "Pec Deck / Machine Fly", "Seated Arnold Press", "Cable Lateral Raise", "Rope Pushdown"] },
  { title: "CORE + MOBILITY", exercises: [] },
  { title: "PULL DAY", exercises: ["Landmine Row", "Chest-Supported DB Row", "Neutral-Grip Pulldown", "Straight-Arm Pulldown", "Rear Delt Fly", "DB Shrugs", "Incline DB Curl"] },
  { title: "LOWER + CORE", exercises: ["Leg Curl (machine)", "Leg Press", "Leg Extension", "Hip Thrust (bench)", "Walking Lunges", "Standing Calf Raises"] },
  { title: "CORE + MOBILITY", exercises: [] },
];

void NOTIF_PERM_KEY; // referenced for completeness, used via localStorage key

const WEEK: WeekDay[] = [
  { short: "SUN", dayIndex: 0 },
  { short: "MON", dayIndex: 1 },
  { short: "TUE", dayIndex: 2 },
  { short: "WED", dayIndex: 3 },
  { short: "THU", dayIndex: 4 },
  { short: "FRI", dayIndex: 5 },
  { short: "SAT", dayIndex: 6 },
];

// JS day-of-week (0=Sun) → PROGRAM_DAYS index.
// Mon → Foundational #1 (0), Tue → Progression Block (1), Wed → Foundational #2 (2),
// Thu → Mobility + Core & Calf (3), Fri → Foundational #3 (4), Sat/Sun → rest.
const DAY_MAP: { [dow: number]: number | null } = {
  0: null, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: null,
};

// ── PISTOL SKILL ─────────────────────────────────────────────────────────────
// Box Pistol only for now (no stage selector). Tracked left/right separately;
// box height (inches) is the primary progression variable, counterbalance optional.
// Start ~18–20" box (5–10 lb counterbalance allowed), advance toward ~16" at
// 3×6/side. Eccentrics first at a new height. Elevate heel if ankle limits depth;
// let the box set depth.
const PISTOL_SKILL: SkillExercise[] = [
  {
    name: "Box Pistol", sets: 3, reps: "6-8/side",
    hasBox: true, hasCounterbalance: true,
    note: "Weaker side first. Box height (inches) is the primary progression variable — let the box set depth. Start ~18–20\", 5–10 lb counterbalance allowed, advance toward ~16\". Eccentrics first at a new height. Elevate heel if ankle limits depth; pelvis neutral.",
  },
];

// Stock MAPS Symmetry Phase I foundational workout (identical for #1/#2/#3 in the
// stock plan). Eli's only Phase-I mod to this list: DROP the Hanging Iso-Lat
// Stretch. Reps/holds are the stock scheme (2×15s holds, 2×10, 2×10 each side).
const PHASE1_FOUNDATIONAL: Exercise[] = [
  { name: "Dunphy Squat Hold",            sets: 2, reps: "15s hold", note: "Sit into the suspension squat and hold — chest tall, weight in the heels." },
  { name: "Hip Bridge Hold",              sets: 2, reps: "15s hold", note: "Drive through heels, squeeze glutes, hold — ribs down." },
  { name: "Single-Leg Suspension Squat",  sets: 2, reps: "10/leg", unilateral: true, note: "Weaker side first. Use the straps for balance, control the descent." },
  { name: "Single-Leg Toe Touch",         sets: 2, reps: "10/leg", unilateral: true, note: "Weaker side first. Hinge and reach — balance and hamstring control." },
  { name: "Suspension Fly Hold",          sets: 2, reps: "15s hold", note: "Arms wide, hold the stretch position under tension." },
  { name: "Suspension Extended Fly Hold", sets: 2, reps: "15s hold", note: "Longer lever than the fly hold — brace the core." },
  { name: "Suspension Anchor Push-Up",    sets: 2, reps: "10/arm", unilateral: true, note: "Weaker side first." },
  { name: "Suspension Row Hold",          sets: 2, reps: "15s hold", note: "Pull to the top and hold — shoulder blades down and back." },
  { name: "Single-Arm Suspension Row",    sets: 2, reps: "10/arm", unilateral: true, note: "Weaker side first. Drive the elbow back, resist rotation." },
  { name: "Thread The Needle Iso-\"Smash\"", sets: 2, reps: "15s/side", unilateral: true, note: "Weaker side first. Thoracic rotation under tension." },
  { name: "Suspension \"W\" Hold",         sets: 2, reps: "15s hold", note: "Pull into a W, squeeze low traps — shoulder rehab-friendly." },
  { name: "Suspension Crocodile \"I\"",    sets: 2, reps: "10/side", unilateral: true, note: "Weaker side first." },
  { name: "Wrist CARS Quadruped",         sets: 2, reps: "15s hold", note: "Controlled wrist circles on all fours." },
  { name: "Bicep Squeeze",                sets: 2, reps: "15s hold", note: "Peak-contraction isometric hold." },
  { name: "Suspension Curls",             sets: 2, reps: "10", note: "Lean back, curl the body up, squeeze." },
  { name: "Skull Crusher Iso-Hold",       sets: 2, reps: "15s hold", note: "Hold the stretched triceps position under tension." },
  { name: "Diamond Hold",                 sets: 2, reps: "15s hold", note: "Diamond-hand push-up position hold — triceps." },
  { name: "Suspension Skull Crusher",     sets: 2, reps: "10", note: "Hinge at the elbows, extend — control the return." },
];

// Standard PM stretches for the TRX foundational days.
const FOUNDATIONAL_PM: WarmupItem[] = [
  { name: "Doorway Chest Stretch", duration: "60s each side", cue: "Arm at 90°, lean into doorframe — don't arch your lower back" },
  { name: "Child's Pose with Lat Reach", duration: "60s each side", cue: "Walk hands far to each side — feel the lat lengthen" },
  { name: "Supine Spinal Twist", duration: "60s each side", cue: "Both shoulders stay on the floor — decompress the spine" },
  { name: "Figure-4 / Pigeon", duration: "90s each side", cue: "Hip external rotation — breathe into the tension" },
];

// ── PROGRAM ─────────────────────────────────────────────────────────────────
// Stock MAPS Symmetry Phase I, adapted. 5 days, ~45-min cap, 60s rest, weaker
// side first on all unilateral work.
//   0 Mon  Foundational #1 (TRX/suspension, stock list minus hanging iso-lat stretch)
//   1 Tue  Mobility Session #1 + box pistols + tracked progression work
//   2 Wed  Foundational #2 (same TRX list)
//   3 Thu  Mobility Session #2 + Core & Calf + box pistols
//   4 Fri  Foundational #3 (same TRX list)
const PROGRAM_DAYS: ProgramDay[] = [
  {
    id: 0, title: "FOUNDATIONAL #1", subtitle: "Phase I · TRX / suspension",
    color: "#B85C38", kind: "foundational",
    warmup: [],
    exercises: PHASE1_FOUNDATIONAL,
    pm: FOUNDATIONAL_PM,
  },
  {
    id: 1, title: "MOBILITY + PROGRESSION", subtitle: "Mobility · box pistols · tracked work",
    color: "#4A7FA5", kind: "progression",
    warmup: [],
    exercises: [],
    skill: PISTOL_SKILL,
    tracked: [
      { name: "Copenhagen Plank", sets: 2, target: "R 50s / L 45s (bent-knee baseline)", unilateral: true, metric: "time", note: "Baseline 9/8: bent-knee R 50s/45s, L 50s/40s. Bottom knee can touch floor to reduce load. Weaker side first." },
      { name: "Single-Leg Glute Bridge", sets: 3, target: "R 10 / L 10-12", unilateral: true, metric: "reps", note: "Baseline R 10/10/8, L 10/12/10. Keep pelvis level — don't let one side drop. Weaker side first." },
      { name: "Hollow-Body Hold", sets: 3, target: "35s / 24s / 30s", metric: "time", note: "Baseline 35s/24s/30s. Lower back stays pressed down, ribs in." },
      { name: "Pallof Press", sets: 2, target: "22.5", unilateral: true, metric: "reps", note: "Working: 22.5. Press and hold — resist the cable pulling you sideways. Weaker side first." },
      { name: "Face Pulls", sets: 3, target: "27.5", metric: "reps", note: "Working: 27.5. Rehab — non-negotiable while the left shoulder is impinged. High elbows, external rotation at the end." },
      { name: "Prone Y-Raise", sets: 3, target: "weight × reps", metric: "weight", note: "Rehab for the shoulder — you can load this. Thumbs up, lift into a Y, squeeze low traps, no shrug." },
    ],
    pool: {
      "Mobility Session #1": [
        { name: "Foam Roll: Piriformis",       cue: "20+ seconds, ease into it" },
        { name: "Foam Roll: IT Band",          cue: "20+ seconds per side" },
        { name: "Foam Roll: Erector Spinae",   cue: "Low-back roll — go higher/lighter if it's tender" },
        { name: "Foam Roll: Latissimus Dorsi", cue: "20+ seconds per side" },
        { name: "Inch Worm to Upward Dog Walk", cue: "20 yards — walk it out, open the front line" },
        { name: "90/90 Stretch",               cue: "10 reps each leg — feel both internal & external rotation" },
        { name: "In-Step Lunge w/ Shoulder Rotations", cue: "20 yards — open through the thoracic spine" },
        { name: "Knee Abduction",              cue: "30/30 reps — band or cable" },
        { name: "Knee Adduction",              cue: "30/30 reps" },
        { name: "Rubber Band Pull-A-Parts",    cue: "20 reps — shoulder rehab, high elbows" },
        { name: "Rubber Band Internal Rotation", cue: "20/20 reps" },
        { name: "Front-Loaded Kettlebell Walk", cue: "40 yards down & back — brace, ribs down" },
        { name: "Suitcase Carry",              cue: "40 yards — tall posture, don't lean to the loaded side" },
      ],
    },
    pm: [
      { name: "Figure-4 / Pigeon", duration: "90s each side", cue: "Prioritize hip external rotation. Breathe into the tension." },
      { name: "Ankle Dorsiflexion Stretch", duration: "45s each side", cue: "Knee over toes against a wall — supports pistol depth" },
      { name: "Supine Spinal Twist", duration: "60s each side", cue: "Both shoulders stay on the floor" },
    ],
  },
  {
    id: 2, title: "FOUNDATIONAL #2", subtitle: "Phase I · TRX / suspension",
    color: "#B85C38", kind: "foundational",
    warmup: [],
    exercises: PHASE1_FOUNDATIONAL,
    pm: FOUNDATIONAL_PM,
  },
  {
    id: 3, title: "MOBILITY + CORE & CALF", subtitle: "Mobility · core & calf · box pistols",
    color: "#4A7FA5", kind: "mobility",
    warmup: [], exercises: [],
    skill: PISTOL_SKILL,
    coreCalf: [
      { name: "Cable Chop", sets: 2, reps: "10/side", unilateral: true, note: "Stock Session #2 core move. Rotate from the hips/thoracic, not the lumbar. Weaker side first." },
      { name: "Single-Leg Seated Calf Raise", sets: 2, reps: "10/side", unilateral: true, note: "Seated (standing calf raise is out — spinal loading). Pause at the top, slow descent. Weaker side first." },
    ],
    pool: {
      "Mobility Session #2": [
        { name: "Lateral Lunge Hop",   cue: "40/40 yards — athletic, controlled landings" },
        { name: "Walking Heel Squat",  cue: "40/40 yards" },
        { name: "Inch Worms",          cue: "20 yards — walk the hands out, brace" },
        { name: "Leg Swings",          cue: "20/20 reps — front-to-back and lateral" },
        { name: "Walking Knee Raise",  cue: "40 yards — tall, drive the knee up" },
        { name: "Stick Dislocates",    cue: "10 reps — slow, controlled shoulder ROM" },
        { name: "Stick Wrap Arounds",  cue: "10/10 reps" },
        { name: "Good Morning",        cue: "10 reps — light, hinge with a flat back; keep it easy on the low back" },
        { name: "Dunphy Squat",        cue: "6–8 reps — deep supported squat, own the bottom" },
        { name: "Lateral Drivers",     cue: "10/10 reps" },
        { name: "Iso Drivers",         cue: "10 reps" },
        { name: "Rotational Lunge",    cue: "10/10 reps — rotate through the hips/thoracic" },
      ],
    },
    pm: [
      { name: "Figure-4 / Pigeon", duration: "90s each side", cue: "Give the hips extra time here" },
      { name: "Supine Spinal Twist", duration: "60s each side", cue: "Full spinal reset" },
      { name: "Legs Up the Wall", duration: "3–5 min", cue: "Passive posterior-chain drain before sleep" },
      { name: "Diaphragmatic Breathing", duration: "2 min", cue: "In through nose (belly rises), out slow. Parasympathetic reset." },
    ],
  },
  {
    id: 4, title: "FOUNDATIONAL #3", subtitle: "Phase I · TRX / suspension",
    color: "#B85C38", kind: "foundational",
    warmup: [],
    exercises: PHASE1_FOUNDATIONAL,
    pm: FOUNDATIONAL_PM,
  },
];

const REST_TIPS: RestTip[] = [
  { label: "Sleep is Training", body: "7–9 hours is when growth hormone peaks. This is when your body actually builds muscle." },
  { label: "Protein still matters", body: "Don't drop intake on rest days. Muscle repairs around the clock — keep it at 0.8–1g per lb." },
  { label: "Hydration + Magnesium", body: "Magnesium glycinate before bed helps with cramping and sleep quality. Especially relevant for you." },
  { label: "Plan tomorrow", body: "Check which day is next and know what you're walking into. Remove friction tonight." },
];

const POOL_COLORS: { [category: string]: string } = {
  "Anti-Extension Core": "#B85C38",
  "Anti-Rotation / Lateral": "#A0522D",
  "Hip Hinge / Glute": "#4A7FA5",
  "Mobility / Flow": "#5B8FA8",
  "Cardio": "#6B9DB8",
  "Cardio (optional)": "#6B9DB8",
};

// Daily 5-minute bedtime routine — shown every day, including rest days.
const BEDTIME_ROUTINE: WarmupItem[] = [
  { name: "Half-Kneeling Hip Flexor Stretch", duration: "60s each side", cue: "Posterior pelvic tilt first, squeeze the down-side glute, then lean in" },
  { name: "Cat-Cow", duration: "10 reps", cue: "Exhale into flexion, inhale into extension — decompress the spine" },
  { name: "Supine Figure-4", duration: "45s each side", cue: "On your back, ankle over opposite knee, gently pull the thigh toward you" },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Returns the ISO date string of the most recent Monday (or today if Monday).
// Used as the week key so logs persist through the whole Mon–Sun week.
function weekKey(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // days back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function sendNotification(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "/favicon.ico", silent: false }); } catch (_) {}
  }
}



// ── TIMER HOOK ────────────────────────────────────────────────────────────────

interface TimerHook {
  seconds: number | null;
  start: (s?: number) => void;
  stop: () => void;
  active: boolean;
}

function useTimer(onComplete: (() => void) | undefined): TimerHook {
  const [seconds, setSeconds] = useState<number | null>(null);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const durationRef = useRef<number>(60);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  const start = useCallback((s = 60) => {
    if (ref.current) clearInterval(ref.current);
    durationRef.current = s;
    startTimeRef.current = Date.now();
    setSeconds(s);
    ref.current = setInterval(() => {
      // Use wall-clock time so background/sleep doesn't desync the countdown
      const elapsed = Math.floor((Date.now() - startTimeRef.current!) / 1000);
      const remaining = durationRef.current - elapsed;
      if (remaining <= 0) {
        clearInterval(ref.current!);
        setSeconds(0);
        cbRef.current?.();
      } else {
        setSeconds(remaining);
      }
    }, 500); // poll at 500ms so it catches up quickly after wake
  }, []);

  const stop = useCallback(() => {
    if (ref.current) clearInterval(ref.current);
    startTimeRef.current = null;
    setSeconds(null);
  }, []);

  useEffect(() => () => {
    if (ref.current) clearInterval(ref.current);
  }, []);

  return { seconds, start, stop, active: seconds !== null };
}

// ── SET MODAL ─────────────────────────────────────────────────────────────────

interface SetModalProps {
  setNum: number;
  totalSets: number;
  suggested: SetData | null;
  onSave: (data: SetData) => void;
  onClose: () => void;
  exerciseName: string;
}

function SetModal({ setNum, totalSets, suggested, onSave, onClose, exerciseName }: SetModalProps) {
  const [weight, setWeight] = useState<string | null>(null);
  const [reps,   setReps]   = useState<string | null>(null);

  const displayWeight = weight ?? suggested?.weight ?? "";
  const displayReps   = reps   ?? suggested?.reps   ?? "";
  const weightIsDefault = weight === null && !!suggested?.weight;
  const repsIsDefault   = reps   === null && !!suggested?.reps;

  const handleSave = () => {
    onSave({
      weight: weight ?? suggested?.weight ?? "–",
      reps:   reps   ?? suggested?.reps   ?? "–",
    });
  };

  return (
    <div onClick={onClose} className="set-modal-overlay">
      <div onClick={e => e.stopPropagation()} style={{
        background: "#DDD7CC", border: "1px solid #7A7268",
        borderRadius: "20px 20px 0 0", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))",
        width: "100%", maxWidth: "480px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <div style={{ color: "#2A2420", fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>{exerciseName}</div>
            <div style={{ color: "#5A5248", fontSize: "11px", letterSpacing: "0.12em", fontWeight: 700 }}>
              LOG SET {setNum} <span style={{ color: "#7A7268" }}>/ {totalSets}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6A6258", fontSize: "20px", cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
          {/* WEIGHT */}
          <div style={{ flex: 1 }}>
            <label style={{ color: "#5A5248", fontSize: "11px", display: "block", marginBottom: "8px", letterSpacing: "0.08em" }}>WEIGHT (lbs)</label>
            <input
              type="number" inputMode="decimal"
              value={displayWeight}
              autoFocus
              onFocus={e => e.target.select()}
              onChange={e => setWeight(e.target.value)}
              style={{
                width: "100%", background: "#E8E2D8",
                border: `1px solid ${weightIsDefault ? "#C8C0A8" : "#C8C0A8"}`,
                borderRadius: "12px", padding: "16px 12px",
                color: weightIsDefault ? "#A09070" : "#2A2420",
                fontSize: "30px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
                outline: "none", boxSizing: "border-box", textAlign: "center",
                transition: "color 0.15s, border-color 0.15s",
              }}
            />
          </div>
          {/* REPS */}
          <div style={{ flex: 1 }}>
            <label style={{ color: "#5A5248", fontSize: "11px", display: "block", marginBottom: "8px", letterSpacing: "0.08em" }}>REPS</label>
            <input
              type="number" inputMode="decimal"
              value={displayReps}
              onFocus={e => e.target.select()}
              onChange={e => setReps(e.target.value)}
              style={{
                width: "100%", background: "#E8E2D8",
                border: `1px solid ${repsIsDefault ? "#C8C0A8" : "#C8C0A8"}`,
                borderRadius: "12px", padding: "16px 12px",
                color: repsIsDefault ? "#A09070" : "#2A2420",
                fontSize: "30px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
                outline: "none", boxSizing: "border-box", textAlign: "center",
                transition: "color 0.15s, border-color 0.15s",
              }}
            />
          </div>
        </div>

        {(!weightIsDefault && !repsIsDefault) && <div style={{ marginBottom: "16px" }} />}

        <button onClick={handleSave} style={{
          width: "100%", padding: "17px", background: "#B85C38",
          border: "none", borderRadius: "12px", color: "#F5F0E8",
          fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", letterSpacing: "0.08em",
        }}>
          SAVE SET {setNum}
        </button>
      </div>
    </div>
  );
}

// ── WARMUP SECTION ────────────────────────────────────────────────────────────

interface WarmupSectionProps {
  items: string[];
  accent: string;
  done: boolean;
  onDone: () => void;
}

function WarmupSection({ items, accent, done, onDone }: WarmupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleCheck = () => {
    onDone();
    setTimeout(() => setCollapsed(true), 400);
  };

  return (
    <div style={{ marginBottom: "12px" }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "0 0 8px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: done ? "#2E6B4A" : "#7A7268", fontSize: "11px", letterSpacing: "0.1em", fontWeight: 700 }}>
            WARM-UP
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {done && <span style={{ color: "#2E6B4A", fontSize: "11px", fontWeight: 700 }}>✓ DONE</span>}
          <span style={{ color: "#7A7268", fontSize: "14px" }}>{collapsed ? "+" : "−"}</span>
        </div>
      </button>

      {!collapsed && (
        <div style={{
          background: done ? "#E8E6E2" : "#E8E2D8",
          border: `1px solid ${done ? "#4A7A62" : "#D8D2C8"}`,
          borderRadius: "10px", padding: "12px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "12px", transition: "all 0.3s",
        }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {items.map((w, i) => (
              <div key={w} style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "6px 0",
                borderTop: i > 0 ? `1px solid ${done ? "#C8C4BC" : "#D8D2C8"}` : "none",
              }}>
                <span style={{
                  width: "5px", height: "5px", borderRadius: "50%", flexShrink: 0,
                  background: done ? "#4A7A62" : accent,
                  opacity: done ? 0.5 : 0.6,
                }} />
                <span style={{
                  color: done ? "#8A7A70" : "#5A5248", fontSize: "12px",
                  textDecoration: done ? "line-through" : "none",
                  transition: "all 0.3s",
                }}>
                  {w}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (!done) handleCheck(); }}
            style={{
              width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
              background: done ? "#2E6B4A" : "transparent",
              border: `2px solid ${done ? "#2E6B4A" : "#7A7268"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: done ? "default" : "pointer", transition: "all 0.25s",
            }}
          >
            {done && <span style={{ color: "#F5F0E8", fontSize: "14px", fontWeight: 700 }}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}

// ── WORKOUT SECTION ──────────────────────────────────────────────────────────

interface WorkoutSectionProps {
  exercises: Exercise[];
  accent: string;
  doneSets: number;
  totalSets: number;
  activeExIdx: number;
  getExLogs: (exIdx: number) => { [setNum: number]: SetData };
  getLastSessionExLogs: (exIdx: number) => { [setNum: number]: SetData } | null;
  onLogSet: (exIdx: number, setNum: number, data: SetData) => void;
  onStartTimer: (exIdx: number, setNum: number) => void;
  onStopTimer: () => void;
  getExNote: (exIdx: number) => string;
  onExNoteChange: (exIdx: number, note: string) => void;
}

function WorkoutSection({ exercises, accent, doneSets, totalSets, activeExIdx, getExLogs, getLastSessionExLogs, onLogSet, onStartTimer, onStopTimer, getExNote, onExNoteChange }: WorkoutSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = doneSets === totalSets && totalSets > 0;

  return (
    <div style={{ marginBottom: "12px" }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "0 0 8px 0",
        }}
      >
        <span style={{ color: allDone ? "#2E6B4A" : "#7A7268", fontSize: "11px", letterSpacing: "0.1em", fontWeight: 700 }}>
          WORKOUT
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {allDone && <span style={{ color: "#2E6B4A", fontSize: "11px", fontWeight: 700 }}>✓ DONE</span>}
          {!allDone && doneSets > 0 && (
            <span style={{ color: "#7A7268", fontSize: "11px", fontFamily: "'Space Mono', monospace" }}>{doneSets}/{totalSets}</span>
          )}
          <span style={{ color: "#7A7268", fontSize: "14px" }}>{collapsed ? "+" : "−"}</span>
        </div>
      </button>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {exercises.map((ex, exIdx) => (
            <ExerciseCard
              key={exIdx} ex={ex} exIdx={exIdx} accent={accent}
              logs={getExLogs(exIdx)}
              lastSessionLogs={getLastSessionExLogs(exIdx)}
              isCurrent={exIdx === activeExIdx}
              isNext={exIdx === activeExIdx + 1}
              onLogSet={onLogSet}
              onStartTimer={onStartTimer}
              onStopTimer={onStopTimer}
              exNote={getExNote(exIdx)}
              onExNoteChange={(note) => onExNoteChange(exIdx, note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── EXERCISE CARD ─────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  ex: Exercise;
  exIdx: number;
  accent: string;
  logs: { [setNum: number]: SetData };
  lastSessionLogs: { [setNum: number]: SetData } | null;
  isCurrent: boolean;
  isNext: boolean;
  onLogSet: (exIdx: number, setNum: number, data: SetData) => void;
  onStartTimer: (exIdx: number, setNum: number) => void;
  onStopTimer: () => void;
  exNote: string;
  onExNoteChange: (note: string) => void;
}

function ExerciseCard({ ex, exIdx, accent, logs, lastSessionLogs, isCurrent, isNext, onLogSet, onStartTimer, onStopTimer, exNote, onExNoteChange }: ExerciseCardProps) {
  const [modal, setModal] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [doneCollapsed, setDoneCollapsed] = useState(true);
  const completedSets = Object.keys(logs).length;
  const allDone = completedSets >= ex.sets;

  const getSuggested = (setNum: number): SetData | null => {
    if (setNum > 1 && logs[setNum - 1]) return logs[setNum - 1];
    if (lastSessionLogs?.[setNum]) return lastSessionLogs[setNum];
    if (lastSessionLogs?.[1]) return lastSessionLogs[1];
    return null;
  };

  const lastSessionSummary = lastSessionLogs
    ? Object.entries(lastSessionLogs)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, v]) => `${v.weight}×${v.reps}`)
        .join(", ")
    : null;

  return (
    <>
      <div style={{
        background: allDone ? "#E8E6E2" : isCurrent ? "#E8E2D8" : "#EDE8DF",
        border: `1px solid ${allDone ? "#4A7A62" : isCurrent ? accent + "50" : "#D8D2C8"}`,
        borderRadius: "14px", padding: allDone ? "12px 16px" : "16px",
        transition: "all 0.3s",
        position: "relative", overflow: "hidden",
      }}>
        {isCurrent && !allDone && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "2px",
            background: `linear-gradient(90deg, ${accent}, transparent)`,
          }} />
        )}
        {isNext && !allDone && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px",
            background: "linear-gradient(90deg, #7A7268, transparent)" }} />
        )}

        {allDone ? (
          /* ── MINIMIZED DONE STATE ── */
          <div
            onClick={() => setDoneCollapsed(c => !c)}
            style={{ cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#2E6B4A", fontWeight: 700, fontSize: "13px" }}>✓ {ex.name}</span>
              <span style={{ color: "#2E6B4A", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}>
                {doneCollapsed ? "DONE" : "−"}
              </span>
            </div>
            {!doneCollapsed && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "12px", justifyContent: "center" }}>
                {Array.from({ length: ex.sets }).map((_, i) => {
                  const setNum = i + 1;
                  const log = logs[setNum];
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{
                        width: "46px", height: "46px", borderRadius: "50%",
                        background: "#2E6B4A", border: `2px solid #2E6B4A`,
                        color: "#fff", fontSize: "16px", fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>✓</div>
                      {log && (log.weight || log.reps) && (
                        <span style={{ color: "#4A7A62", fontSize: "10px", fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                          {log.weight}{log.reps ? `×${log.reps}` : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div style={{ flex: 1, paddingRight: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: isCurrent ? "#1A1410" : "#5A5248", fontWeight: 700, fontSize: "14px", lineHeight: 1.3 }}>
                    {ex.name}
                  </span>
                  {isNext && (
                    <span style={{ color: "#7A7268", fontSize: "10px", letterSpacing: "0.08em", fontWeight: 700, flexShrink: 0 }}>UP NEXT</span>
                  )}
                  {(ex.note || lastSessionSummary) && (
                    <button
                      onClick={() => setShowInfo(v => !v)}
                      style={{
                        background: showInfo ? "#D8D2C8" : "transparent",
                        border: `1px solid ${showInfo ? "#B8B0A8" : "#C8C0A8"}`,
                        borderRadius: "50%", width: "18px", height: "18px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
                        color: showInfo ? "#5A5248" : "#8A7A70", fontSize: "11px", fontWeight: 700,
                        lineHeight: 1, padding: 0,
                      }}
                    >i</button>
                  )}
                </div>
                {showInfo && (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {ex.note && (
                      <div style={{ color: "#6A6258", fontSize: "12px", fontStyle: "italic", lineHeight: 1.4 }}>{ex.note}</div>
                    )}
                    {lastSessionSummary && (
                      <div style={{ color: "#7A7268", fontSize: "11px" }}>
                        Last week: <span style={{ fontFamily: "'Space Mono', monospace" }}>{lastSessionSummary}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span style={{
                color: isCurrent ? accent : "#6A6258",
                fontSize: "11px", fontWeight: 700, fontFamily: "'Space Mono', monospace",
                background: isCurrent ? `${accent}18` : "#E8E2D8",
                padding: "5px 9px", borderRadius: "6px", flexShrink: 0, whiteSpace: "nowrap",
              }}>
                {ex.sets}×{ex.reps}
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "center" }}>
              {Array.from({ length: ex.sets }).map((_, i) => {
                const setNum = i + 1;
                const log = logs[setNum];
                const done = !!log;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <button
                      onClick={() => { onStopTimer(); setModal(setNum); }}
                      style={{
                        width: "46px", height: "46px", borderRadius: "50%",
                        background: done ? accent : isCurrent ? "#D8D2C8" : "#E8E2D8",
                        border: `2px solid ${done ? accent : isCurrent ? accent + "40" : "#C8C0A8"}`,
                        color: done ? "#fff" : isCurrent ? "#666" : "#6A6258",
                        fontSize: done ? "16px" : "13px",
                        fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s",
                        fontFamily: "'Space Mono', monospace",
                      }}
                    >
                      {done ? "✓" : setNum}
                    </button>
                    {done && (log.weight || log.reps) && (
                      <span style={{ color: "#6A6258", fontSize: "10px", fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                        {log.weight}{log.reps ? `×${log.reps}` : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Per-exercise notes */}
            <div style={{ marginTop: "12px" }}>
              <textarea
                value={exNote}
                onChange={e => onExNoteChange(e.target.value)}
                placeholder="Notes for this exercise..."
                rows={1}
                style={{
                  width: "100%", background: exNote ? "#E0DBD0" : "transparent",
                  border: `1px solid ${exNote ? "#B8B0A8" : "#D0CAC0"}`,
                  borderRadius: "8px", padding: "8px 10px",
                  color: "#3A3028", fontSize: "12px", fontFamily: "'DM Sans', sans-serif",
                  resize: "none", outline: "none", boxSizing: "border-box",
                  lineHeight: 1.5, transition: "border-color 0.2s, background 0.2s",
                  overflow: "hidden",
                }}
                onFocus={e => { e.target.style.borderColor = accent; e.target.style.background = "#E0DBD0"; }}
                onBlur={e => { e.target.style.borderColor = exNote ? "#B8B0A8" : "#D0CAC0"; if (!exNote) e.target.style.background = "transparent"; }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
              />
            </div>
          </>
        )}
      </div>

      {modal !== null && (
        <SetModal
          setNum={modal} totalSets={ex.sets} suggested={getSuggested(modal)}
          exerciseName={ex.name}
          onSave={data => { onLogSet(exIdx, modal, data); setModal(null); onStartTimer(exIdx, modal); }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── PM STRETCH SECTION ────────────────────────────────────────────────────────

interface PMSectionProps {
  stretches: WarmupItem[];
  nextDayTitle: string | null | undefined;
}

function PMSection({ stretches, nextDayTitle }: PMSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [checked, setChecked] = useState<{ [idx: number]: boolean }>({});
  const doneCount = Object.values(checked).filter(Boolean).length;
  const allDone = doneCount === stretches.length;

  return (
    <div style={{ marginTop: "12px" }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: "100%", background: "none", border: "none",
          cursor: "pointer", padding: "0 0 10px 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: allDone ? "#4A7FA5" : "#5A5248", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em" }}>
            PM STRETCHES
          </span>
          {allDone && <span style={{ color: "#4A7FA5", fontSize: "11px", fontWeight: 700 }}>✓ DONE</span>}
          {!allDone && doneCount > 0 && (
            <span style={{ color: "#7A7268", fontSize: "11px", fontFamily: "'Space Mono', monospace" }}>{doneCount}/{stretches.length}</span>
          )}
        </div>
        <span style={{ color: "#7A7268", fontSize: "14px" }}>{collapsed ? "+" : "−"}</span>
      </button>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {nextDayTitle && (
            <div style={{ color: "#C8DCE8", fontSize: "11px", marginBottom: "4px", fontStyle: "italic" }}>
              Prepares you for: {nextDayTitle}
            </div>
          )}
          {stretches.map((s, i) => {
            const done = !!checked[i];
            return (
              <button
                key={i}
                onClick={() => setChecked(p => ({ ...p, [i]: !p[i] }))}
                style={{
                  display: "flex", alignItems: "flex-start",
                  background: done ? "#EAF0F5" : "#EDE8DF",
                  border: `1px solid ${done ? "#D8E8F0" : "#D8D2C8"}`,
                  borderRadius: "10px", padding: "12px 14px",
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.2s",
                  gap: "12px",
                }}
              >
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                  background: done ? "#4A7FA5" : "transparent",
                  border: `1.5px solid ${done ? "#4A7FA5" : "#7A7268"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}>
                  {done && <span style={{ color: "#F5F0E8", fontSize: "10px", fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ color: done ? "#C8DCE8" : "#3A3028", fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>
                      {s.name}
                    </span>
                    <span style={{ color: done ? "#D8E8F0" : "#4A7FA5", fontSize: "11px", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
                      {s.duration}
                    </span>
                  </div>
                  <div style={{ color: done ? "#C8DCE8" : "#6A6258", fontSize: "12px", fontStyle: "italic", lineHeight: 1.4 }}>
                    {s.cue}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── POOL DAY ──────────────────────────────────────────────────────────────────

interface PoolDayProps {
  day: ProgramDay;
  todayChecked: { [exerciseName: string]: boolean };
  onToggle: (exerciseName: string) => void;
  freq: FreqMap;
}

function PoolDay({ day, todayChecked, onToggle, freq }: PoolDayProps) {
  const [open, setOpen] = useState<string | null>(null);
  const checkedCount = Object.values(todayChecked).filter(Boolean).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
        <p style={{ color: "#5A5248", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
          Work through the session — tap to check off.
        </p>
        {checkedCount > 0 && (
          <span style={{ color: "#4A7FA5", fontSize: "11px", fontFamily: "'Space Mono', monospace", flexShrink: 0, marginLeft: "8px" }}>
            {checkedCount} done
          </span>
        )}
      </div>
      {Object.entries(day.pool ?? {}).map(([cat, items]) => {
        const isOpen = open === cat;
        const color = POOL_COLORS[cat] || "#5A5248";
        const catChecked = items.filter(item => todayChecked[item.name]).length;
        return (
          <div key={cat} style={{ marginBottom: "6px", border: `1px solid ${isOpen ? color + "55" : "#D8D2C8"}`, borderRadius: "12px", overflow: "hidden", transition: "border-color 0.2s" }}>
            <button onClick={() => setOpen(isOpen ? null : cat)} style={{
              width: "100%", background: isOpen ? `${color}10` : "#EDE8DF",
              border: "none", padding: "13px 16px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: "pointer", color: isOpen ? color : "#5A5248",
              fontSize: "11px", fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: catChecked > 0 ? color : "#7A7268", flexShrink: 0, transition: "background 0.2s" }} />
                {cat}
                {catChecked > 0 && (
                  <span style={{ color, fontSize: "10px", fontWeight: 700 }}>×{catChecked}</span>
                )}
              </span>
              <span style={{ fontSize: "16px", opacity: 0.4 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div style={{ background: "#E8E2D8" }}>
                {items.map((item) => {
                  const done = !!todayChecked[item.name];
                  const count = freq[item.name] || 0;
                  const isHeavy = count >= 6;
                  const isLight = count <= 1;
                  return (
                    <div key={item.name} style={{
                      padding: "11px 14px", borderTop: "1px solid #E8E2D8",
                      display: "flex", alignItems: "center", gap: "12px",
                      background: done ? `${color}08` : "transparent",
                      transition: "background 0.2s",
                    }}>
                      {/* Checkmark button */}
                      <button
                        onClick={() => onToggle(item.name)}
                        style={{
                          width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                          background: done ? color : "transparent",
                          border: `1.5px solid ${done ? color : "#7A7268"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "all 0.2s",
                        }}
                      >
                        {done && <span style={{ color: "#F5F0E8", fontSize: "11px", fontWeight: 700 }}>✓</span>}
                      </button>

                      {/* Name + cue */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: done ? "#7A7268" : "#3A3028", fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>
                          {item.name}
                        </div>
                        <div style={{ color: "#6A6258", fontSize: "12px", marginTop: "2px", fontStyle: "italic" }}>{item.cue}</div>
                      </div>

                      {/* 4-week frequency badge */}
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        {count > 0 ? (
                          <span style={{
                            fontSize: "10px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
                            color: isHeavy ? "#8a4a2a" : isLight ? "#4A7FA5" : "#6A6258",
                            background: isHeavy ? "#F0E8E0" : isLight ? "#EAF0F5" : "transparent",
                            padding: isHeavy || isLight ? "2px 6px" : "0",
                            borderRadius: "4px",
                          }}>
                            ×{count}
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", color: "#7A7268", fontFamily: "'Space Mono', monospace" }}>new</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── REST DAY ──────────────────────────────────────────────────────────────────

function RestDayView() {
  return (
    <div>
      <div style={{ textAlign: "center", padding: "20px 0 16px", fontSize: "44px" }}>🌿</div>
      {REST_TIPS.map((tip, i) => (
        <div key={i} style={{ background: "#E8E2D8", border: "1px solid #D8D2C8", borderRadius: "12px", padding: "14px 16px", marginBottom: "8px" }}>
          <span style={{ color: "#B85C38", fontWeight: 700, fontSize: "13px" }}>{tip.label}. </span>
          <span style={{ color: "#6A6258", fontSize: "13px", lineHeight: 1.5 }}>{tip.body}</span>
        </div>
      ))}
    </div>
  );
}

// ── BEDTIME ROUTINE (daily, all days) ───────────────────────────────────────

function BedtimeSection() {
  const [collapsed, setCollapsed] = useState(true);
  const [checked, setChecked] = useState<{ [idx: number]: boolean }>({});
  const doneCount = Object.values(checked).filter(Boolean).length;
  const allDone = doneCount === BEDTIME_ROUTINE.length;

  return (
    <div style={{ marginTop: "12px" }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "0 0 10px 0", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: allDone ? "#7A5CA5" : "#5A5248", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em" }}>
            🌙 BEDTIME ROUTINE
          </span>
          {allDone && <span style={{ color: "#7A5CA5", fontSize: "11px", fontWeight: 700 }}>✓ DONE</span>}
          {!allDone && doneCount > 0 && (
            <span style={{ color: "#7A7268", fontSize: "11px", fontFamily: "'Space Mono', monospace" }}>{doneCount}/{BEDTIME_ROUTINE.length}</span>
          )}
        </div>
        <span style={{ color: "#7A7268", fontSize: "14px" }}>{collapsed ? "+" : "−"}</span>
      </button>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ color: "#8A7AA5", fontSize: "11px", marginBottom: "4px", fontStyle: "italic" }}>
            5 minutes, every night — do these no matter which day it is.
          </div>
          {BEDTIME_ROUTINE.map((s, i) => {
            const done = !!checked[i];
            return (
              <button
                key={i}
                onClick={() => setChecked(p => ({ ...p, [i]: !p[i] }))}
                style={{
                  display: "flex", alignItems: "flex-start",
                  background: done ? "#EFEAF5" : "#EDE8DF",
                  border: `1px solid ${done ? "#DDD0F0" : "#D8D2C8"}`,
                  borderRadius: "10px", padding: "12px 14px",
                  cursor: "pointer", textAlign: "left", gap: "12px", transition: "all 0.2s",
                }}
              >
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                  background: done ? "#7A5CA5" : "transparent",
                  border: `1.5px solid ${done ? "#7A5CA5" : "#7A7268"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                }}>
                  {done && <span style={{ color: "#F5F0E8", fontSize: "10px", fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ color: done ? "#9A8AB5" : "#3A3028", fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>
                      {s.name}
                    </span>
                    <span style={{ color: done ? "#B5A5C5" : "#7A5CA5", fontSize: "11px", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
                      {s.duration}
                    </span>
                  </div>
                  <div style={{ color: done ? "#9A8AB5" : "#6A6258", fontSize: "12px", fontStyle: "italic", lineHeight: 1.4 }}>
                    {s.cue}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── COLLAPSIBLE SECTION ───────────────────────────────────────────────────────
// Header bar that matches the mobility-pool category accordion, wrapping any
// section content (box pistols, tracked work, core & calf) so those sections
// visually match the mobility session on the same day.

interface CollapsibleSectionProps {
  title: string;
  accent: string;
  defaultOpen?: boolean;
  doneCount?: number;
  children: ReactNode;
}

function CollapsibleSection({ title, accent, defaultOpen = true, doneCount = 0, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: "6px", border: `1px solid ${open ? accent + "55" : "#D8D2C8"}`, borderRadius: "12px", overflow: "hidden", transition: "border-color 0.2s" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", background: open ? `${accent}10` : "#EDE8DF",
        border: "none", padding: "13px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer", color: open ? accent : "#5A5248",
        fontSize: "11px", fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: doneCount > 0 ? accent : "#7A7268", flexShrink: 0, transition: "background 0.2s" }} />
          {title}
          {doneCount > 0 && <span style={{ color: accent, fontSize: "10px", fontWeight: 700 }}>×{doneCount}</span>}
        </span>
        <span style={{ fontSize: "16px", opacity: 0.4 }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ background: "#E8E2D8", padding: "12px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── SKILL MODAL (pistol work: L/R reps + optional box height & counterbalance) ─

interface SkillModalProps {
  skill: SkillExercise;
  setNum: number;
  suggested: SetData | null;
  onSave: (data: SetData) => void;
  onClose: () => void;
}

function SkillModal({ skill, setNum, suggested, onSave, onClose }: SkillModalProps) {
  const [repsL, setRepsL] = useState<string | null>(null);
  const [repsR, setRepsR] = useState<string | null>(null);
  const [box, setBox]     = useState<string | null>(null);
  const [cb, setCb]       = useState<string | null>(null);

  const dRepsL = repsL ?? suggested?.repsL ?? "";
  const dRepsR = repsR ?? suggested?.repsR ?? "";
  const dBox   = box   ?? suggested?.boxHeight ?? "";
  const dCb    = cb    ?? suggested?.counterbalance ?? "";

  const handleSave = () => {
    const data: SetData = {
      weight: "", reps: "",
      repsL: repsL ?? suggested?.repsL ?? "",
      repsR: repsR ?? suggested?.repsR ?? "",
    };
    if (skill.hasBox) data.boxHeight = box ?? suggested?.boxHeight ?? "";
    if (skill.hasCounterbalance) data.counterbalance = cb ?? suggested?.counterbalance ?? "";
    onSave(data);
  };

  const fieldStyle = {
    width: "100%", background: "#E8E2D8", border: "1px solid #C8C0A8",
    borderRadius: "12px", padding: "14px 12px", color: "#2A2420",
    fontSize: "26px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
    outline: "none", boxSizing: "border-box" as const, textAlign: "center" as const,
  };
  const labelStyle = { color: "#5A5248", fontSize: "11px", display: "block", marginBottom: "8px", letterSpacing: "0.08em" };

  return (
    <div onClick={onClose} className="set-modal-overlay">
      <div onClick={e => e.stopPropagation()} style={{
        background: "#DDD7CC", border: "1px solid #7A7268",
        borderRadius: "20px 20px 0 0", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))",
        width: "100%", maxWidth: "480px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div>
            <div style={{ color: "#2A2420", fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>{skill.name}</div>
            <div style={{ color: "#5A5248", fontSize: "11px", letterSpacing: "0.12em", fontWeight: 700 }}>
              LOG SET {setNum} <span style={{ color: "#7A7268" }}>/ {skill.sets}</span> · target {skill.reps}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6A6258", fontSize: "20px", cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
        <div style={{ color: "#8A6A4A", fontSize: "11px", fontWeight: 700, marginBottom: "16px" }}>Log the WEAKER side first.</div>

        {/* L / R reps */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>LEFT reps</label>
            <input type="number" inputMode="decimal" value={dRepsL} autoFocus
              onFocus={e => e.target.select()} onChange={e => setRepsL(e.target.value)} style={fieldStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>RIGHT reps</label>
            <input type="number" inputMode="decimal" value={dRepsR}
              onFocus={e => e.target.select()} onChange={e => setRepsR(e.target.value)} style={fieldStyle} />
          </div>
        </div>

        {/* Box height + counterbalance */}
        {(skill.hasBox || skill.hasCounterbalance) && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            {skill.hasBox && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>BOX HEIGHT (in)</label>
                <input type="number" inputMode="decimal" value={dBox}
                  onFocus={e => e.target.select()} onChange={e => setBox(e.target.value)}
                  style={{ ...fieldStyle, border: "1px solid #B85C38" }} />
              </div>
            )}
            {skill.hasCounterbalance && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>COUNTERBAL (lb)</label>
                <input type="number" inputMode="decimal" value={dCb}
                  onFocus={e => e.target.select()} onChange={e => setCb(e.target.value)} style={fieldStyle} />
              </div>
            )}
          </div>
        )}

        <button onClick={handleSave} style={{
          width: "100%", padding: "17px", background: "#4A7FA5",
          border: "none", borderRadius: "12px", color: "#F5F0E8",
          fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", letterSpacing: "0.08em",
        }}>
          SAVE SET {setNum}
        </button>
      </div>
    </div>
  );
}

// ── SKILL CARD ────────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: SkillExercise;
  accent: string;
  logs: { [setNum: number]: SetData };
  lastSessionLogs: { [setNum: number]: SetData } | null;
  onLogSet: (setNum: number, data: SetData) => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
}

function SkillCard({ skill, accent, logs, lastSessionLogs, onLogSet, onStartTimer, onStopTimer }: SkillCardProps) {
  const [modal, setModal] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const completed = Object.keys(logs).length;
  const allDone = completed >= skill.sets;

  const getSuggested = (setNum: number): SetData | null => {
    if (setNum > 1 && logs[setNum - 1]) return logs[setNum - 1];
    if (lastSessionLogs?.[setNum]) return lastSessionLogs[setNum];
    if (lastSessionLogs?.[1]) return lastSessionLogs[1];
    return null;
  };

  const fmt = (v: SetData): string => {
    const lr = `L ${v.repsL || "?"} / R ${v.repsR || "?"}`;
    const extra = [
      v.boxHeight ? `${v.boxHeight}"` : "",
      v.counterbalance ? `+${v.counterbalance}lb` : "",
    ].filter(Boolean).join(" ");
    return extra ? `${lr} · ${extra}` : lr;
  };

  return (
    <>
      <div style={{
        background: allDone ? "#E8E6E2" : "#E8E2D8",
        border: `1px solid ${allDone ? "#4A7A62" : accent + "50"}`,
        borderRadius: "14px", padding: "16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div style={{ flex: 1, paddingRight: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: allDone ? "#2E6B4A" : "#1A1410", fontWeight: 700, fontSize: "14px", lineHeight: 1.3 }}>
                {allDone ? "✓ " : ""}{skill.name}
              </span>
              <button onClick={() => setShowInfo(v => !v)} style={{
                background: showInfo ? "#D8D2C8" : "transparent", border: `1px solid ${showInfo ? "#B8B0A8" : "#C8C0A8"}`,
                borderRadius: "50%", width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, color: showInfo ? "#5A5248" : "#8A7A70", fontSize: "11px", fontWeight: 700, lineHeight: 1, padding: 0,
              }}>i</button>
            </div>
            {showInfo && skill.note && (
              <div style={{ marginTop: "8px", color: "#6A6258", fontSize: "12px", fontStyle: "italic", lineHeight: 1.4 }}>{skill.note}</div>
            )}
          </div>
          <span style={{
            color: accent, fontSize: "11px", fontWeight: 700, fontFamily: "'Space Mono', monospace",
            background: `${accent}18`, padding: "5px 9px", borderRadius: "6px", flexShrink: 0, whiteSpace: "nowrap",
          }}>
            {skill.sets}×{skill.reps}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "center" }}>
          {Array.from({ length: skill.sets }).map((_, i) => {
            const setNum = i + 1;
            const log = logs[setNum];
            const done = !!log;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <button
                  onClick={() => { onStopTimer(); setModal(setNum); }}
                  style={{
                    width: "46px", height: "46px", borderRadius: "50%",
                    background: done ? accent : "#D8D2C8",
                    border: `2px solid ${done ? accent : accent + "40"}`,
                    color: done ? "#fff" : "#666", fontSize: done ? "16px" : "13px",
                    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'Space Mono', monospace",
                  }}
                >
                  {done ? "✓" : setNum}
                </button>
                {done && (
                  <span style={{ color: "#6A6258", fontSize: "9px", fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                    {fmt(log)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal !== null && (
        <SkillModal
          skill={skill} setNum={modal} suggested={getSuggested(modal)}
          onSave={data => { onLogSet(modal, data); setModal(null); onStartTimer(); }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── TRACKED MODAL (PR-style: one value per set, L/R when unilateral) ──────────

interface TrackedModalProps {
  ex: TrackedExercise;
  setNum: number;
  suggested: SetData | null;
  onSave: (data: SetData) => void;
  onClose: () => void;
}

function TrackedModal({ ex, setNum, suggested, onSave, onClose }: TrackedModalProps) {
  const [valueL, setValueL] = useState<string | null>(null);
  const [valueR, setValueR] = useState<string | null>(null);
  const [value, setValue]   = useState<string | null>(null);
  const [weight, setWeight] = useState<string | null>(null);
  const [reps, setReps]     = useState<string | null>(null);
  const unit = ex.metric === "time" ? "sec" : "reps";
  const weighted = ex.metric === "weight";

  const dL = valueL ?? suggested?.valueL ?? "";
  const dR = valueR ?? suggested?.valueR ?? "";
  const dV = value  ?? suggested?.value  ?? "";
  const dW = weight ?? suggested?.weight ?? "";
  const dRp = reps  ?? suggested?.reps  ?? "";

  const handleSave = () => {
    const data: SetData = { weight: "", reps: "" };
    if (weighted) {
      data.weight = weight ?? suggested?.weight ?? "";
      data.reps   = reps   ?? suggested?.reps   ?? "";
    } else if (ex.unilateral) {
      data.valueL = valueL ?? suggested?.valueL ?? "";
      data.valueR = valueR ?? suggested?.valueR ?? "";
    } else {
      data.value = value ?? suggested?.value ?? "";
    }
    onSave(data);
  };

  const fieldStyle = {
    width: "100%", background: "#E8E2D8", border: "1px solid #C8C0A8",
    borderRadius: "12px", padding: "16px 12px", color: "#2A2420",
    fontSize: "30px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
    outline: "none", boxSizing: "border-box" as const, textAlign: "center" as const,
  };
  const labelStyle = { color: "#5A5248", fontSize: "11px", display: "block", marginBottom: "8px", letterSpacing: "0.08em" };

  return (
    <div onClick={onClose} className="set-modal-overlay">
      <div onClick={e => e.stopPropagation()} style={{
        background: "#DDD7CC", border: "1px solid #7A7268",
        borderRadius: "20px 20px 0 0", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))",
        width: "100%", maxWidth: "480px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div>
            <div style={{ color: "#2A2420", fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>{ex.name}</div>
            <div style={{ color: "#5A5248", fontSize: "11px", letterSpacing: "0.12em", fontWeight: 700 }}>
              LOG SET {setNum} <span style={{ color: "#7A7268" }}>/ {ex.sets}</span> · {ex.target}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6A6258", fontSize: "20px", cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
        {ex.unilateral && <div style={{ color: "#8A6A4A", fontSize: "11px", fontWeight: 700, marginBottom: "16px" }}>Log the WEAKER side first.</div>}
        {!ex.unilateral && <div style={{ marginBottom: "16px" }} />}

        {weighted ? (
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>WEIGHT (lbs)</label>
              <input type="number" inputMode="decimal" value={dW} autoFocus
                onFocus={e => e.target.select()} onChange={e => setWeight(e.target.value)} style={fieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>REPS</label>
              <input type="number" inputMode="decimal" value={dRp}
                onFocus={e => e.target.select()} onChange={e => setReps(e.target.value)} style={fieldStyle} />
            </div>
          </div>
        ) : ex.unilateral ? (
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>LEFT ({unit})</label>
              <input type="number" inputMode="decimal" value={dL} autoFocus
                onFocus={e => e.target.select()} onChange={e => setValueL(e.target.value)} style={fieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>RIGHT ({unit})</label>
              <input type="number" inputMode="decimal" value={dR}
                onFocus={e => e.target.select()} onChange={e => setValueR(e.target.value)} style={fieldStyle} />
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>{unit.toUpperCase()}</label>
            <input type="number" inputMode="decimal" value={dV} autoFocus
              onFocus={e => e.target.select()} onChange={e => setValue(e.target.value)} style={fieldStyle} />
          </div>
        )}

        <button onClick={handleSave} style={{
          width: "100%", padding: "17px", background: "#4A7FA5",
          border: "none", borderRadius: "12px", color: "#F5F0E8",
          fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", letterSpacing: "0.08em",
        }}>
          SAVE SET {setNum}
        </button>
      </div>
    </div>
  );
}

// ── TRACKED CARD ──────────────────────────────────────────────────────────────

interface TrackedCardProps {
  ex: TrackedExercise;
  accent: string;
  logs: { [setNum: number]: SetData };
  lastSessionLogs: { [setNum: number]: SetData } | null;
  onLogSet: (setNum: number, data: SetData) => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
}

function TrackedCard({ ex, accent, logs, lastSessionLogs, onLogSet, onStartTimer, onStopTimer }: TrackedCardProps) {
  const [modal, setModal] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const completed = Object.keys(logs).length;
  const allDone = completed >= ex.sets;
  const unit = ex.metric === "time" ? "s" : "";

  const getSuggested = (setNum: number): SetData | null => {
    if (setNum > 1 && logs[setNum - 1]) return logs[setNum - 1];
    if (lastSessionLogs?.[setNum]) return lastSessionLogs[setNum];
    if (lastSessionLogs?.[1]) return lastSessionLogs[1];
    return null;
  };

  const fmt = (v: SetData): string =>
    ex.metric === "weight"
      ? `${v.weight || "?"}×${v.reps || "?"}`
      : ex.unilateral
        ? `L ${v.valueL || "?"}${unit} / R ${v.valueR || "?"}${unit}`
      : `${v.value || "?"}${unit}`;

  const lastSummary = lastSessionLogs
    ? Object.entries(lastSessionLogs).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => fmt(v)).join(", ")
    : null;

  return (
    <>
      <div style={{
        background: allDone ? "#E8E6E2" : "#EDE8DF",
        border: `1px solid ${allDone ? "#4A7A62" : "#D8D2C8"}`,
        borderRadius: "14px", padding: "16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div style={{ flex: 1, paddingRight: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: allDone ? "#2E6B4A" : "#5A5248", fontWeight: 700, fontSize: "14px", lineHeight: 1.3 }}>
                {allDone ? "✓ " : ""}{ex.name}
              </span>
              {(ex.note || lastSummary) && (
                <button onClick={() => setShowInfo(v => !v)} style={{
                  background: showInfo ? "#D8D2C8" : "transparent", border: `1px solid ${showInfo ? "#B8B0A8" : "#C8C0A8"}`,
                  borderRadius: "50%", width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0, color: showInfo ? "#5A5248" : "#8A7A70", fontSize: "11px", fontWeight: 700, lineHeight: 1, padding: 0,
                }}>i</button>
              )}
            </div>
            {showInfo && (
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {ex.note && <div style={{ color: "#6A6258", fontSize: "12px", fontStyle: "italic", lineHeight: 1.4 }}>{ex.note}</div>}
                {lastSummary && <div style={{ color: "#7A7268", fontSize: "11px" }}>Last week: <span style={{ fontFamily: "'Space Mono', monospace" }}>{lastSummary}</span></div>}
              </div>
            )}
          </div>
          <span style={{
            color: "#6A6258", fontSize: "11px", fontWeight: 700, fontFamily: "'Space Mono', monospace",
            background: "#E8E2D8", padding: "5px 9px", borderRadius: "6px", flexShrink: 0, whiteSpace: "nowrap", textAlign: "right",
          }}>
            {ex.target}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "center" }}>
          {Array.from({ length: ex.sets }).map((_, i) => {
            const setNum = i + 1;
            const log = logs[setNum];
            const done = !!log;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <button
                  onClick={() => { onStopTimer(); setModal(setNum); }}
                  style={{
                    width: "46px", height: "46px", borderRadius: "50%",
                    background: done ? accent : "#E8E2D8",
                    border: `2px solid ${done ? accent : "#C8C0A8"}`,
                    color: done ? "#fff" : "#6A6258", fontSize: done ? "16px" : "13px",
                    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'Space Mono', monospace",
                  }}
                >
                  {done ? "✓" : setNum}
                </button>
                {done && (
                  <span style={{ color: "#6A6258", fontSize: "9px", fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                    {fmt(log)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal !== null && (
        <TrackedModal
          ex={ex} setNum={modal} suggested={getSuggested(modal)}
          onSave={data => { onLogSet(modal, data); setModal(null); onStartTimer(); }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── LOG EXPORT MODAL ──────────────────────────────────────────────────────────

interface ExportModalProps {
  allLogs: AllLogs;
  coreLogs: CoreLogs;
  notesLogs: NotesLogs;
  onClose: () => void;
}

function ExportModal({ allLogs, coreLogs, notesLogs, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false);

  // Format a stored value for a set, choosing the representation that matches
  // the fields present. Skill/tracked/unilateral records carry L/R (and box)
  // instead of a single weight×reps.
  const fmtSet = (v: SetData): string => {
    if (v.repsL !== undefined || v.repsR !== undefined) {
      const lr = `L ${v.repsL || "?"} / R ${v.repsR || "?"}`;
      const extra = [v.boxHeight ? `box ${v.boxHeight}"` : "", v.counterbalance ? `+${v.counterbalance}lb` : ""].filter(Boolean).join(" ");
      return extra ? `${lr} (${extra})` : lr;
    }
    if (v.valueL !== undefined || v.valueR !== undefined) return `L ${v.valueL || "?"} / R ${v.valueR || "?"}`;
    if (v.value !== undefined) return `${v.value || "?"}`;
    return `${v.weight || "?"}lbs × ${v.reps || "?"}`;
  };

  // Collect every set stored under a given key prefix, in set order.
  const setsForPrefix = (dayLogs: DayLogs, prefix: string): string => {
    return Object.entries(dayLogs)
      .filter(([k]) => k.startsWith(prefix) && !Number.isNaN(parseInt(k.slice(prefix.length))))
      .sort(([a], [b]) => parseInt(a.slice(prefix.length)) - parseInt(b.slice(prefix.length)))
      .map(([, v]) => fmtSet(v))
      .join(", ");
  };

  // ── Current (v2) program logs, labeled by the live program ──
  const formatted = Object.entries(allLogs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayLogs]) => {
      const parts = dateKey.split("|");
      const programIdx = parseInt(parts[1] ?? "");
      const day = PROGRAM_DAYS[programIdx];
      if (!day) return null;
      const lines = [`\n📅 ${parts[0]} — ${day.title}`];

      if (day.kind === "foundational") {
        day.exercises.forEach((ex, exIdx) => {
          const sets = setsForPrefix(dayLogs, `${exIdx}-`);
          if (sets) {
            const note = notesLogs[dateKey]?.[`ex-${exIdx}`];
            lines.push(`  ${ex.name}: ${sets}${note ? ` — "${note}"` : ""}`);
          }
        });
      } else if (day.kind === "progression") {
        (day.skill ?? []).forEach((sk, i) => {
          const sets = setsForPrefix(dayLogs, `skill-${i}-`);
          if (sets) lines.push(`  ${sk.name}: ${sets}`);
        });
        (day.tracked ?? []).forEach((tr, i) => {
          const sets = setsForPrefix(dayLogs, `tracked-${i}-`);
          if (sets) lines.push(`  ${tr.name}: ${sets}`);
        });
      } else if (day.kind === "mobility") {
        (day.skill ?? []).forEach((sk, i) => {
          const sets = setsForPrefix(dayLogs, `skill-${i}-`);
          if (sets) lines.push(`  ${sk.name}: ${sets}`);
        });
        (day.optionalSkill ?? []).forEach((sk, i) => {
          const sets = setsForPrefix(dayLogs, `optskill-${i}-`);
          if (sets) lines.push(`  ${sk.name} (optional): ${sets}`);
        });
        (day.coreCalf ?? []).forEach((ex, i) => {
          const sets = setsForPrefix(dayLogs, `corecalf-${i}-`);
          if (sets) lines.push(`  ${ex.name}: ${sets}`);
        });
      }

      const workoutNote = notesLogs[dateKey]?.["workout"];
      if (workoutNote) lines.push(`  📝 ${workoutNote}`);
      // Only emit the day if it produced at least one exercise line.
      return lines.length > 1 ? lines.join("\n") : null;
    })
    .filter(Boolean)
    .join("\n");

  // ── Legacy (v1) history, labeled by the frozen LEGACY_PROGRAM snapshot ──
  // Read directly from localStorage so old numbers stay attached to the exercise
  // they were actually recorded for, instead of being remapped onto the new
  // program's day/exercise order.
  let legacyLogs: AllLogs = {};
  let legacyNotes: NotesLogs = {};
  try {
    const s = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (s) legacyLogs = JSON.parse(s) as AllLogs;
    const n = localStorage.getItem(LEGACY_NOTES_LOG_KEY);
    if (n) legacyNotes = JSON.parse(n) as NotesLogs;
  } catch (_) {}

  const legacyFormatted = Object.entries(legacyLogs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayLogs]) => {
      const parts = dateKey.split("|");
      const programIdx = parseInt(parts[1] ?? "");
      const legacyDay = LEGACY_PROGRAM[programIdx];
      if (!legacyDay || legacyDay.exercises.length === 0) return null; // skip old pool days
      const lines = [`\n📅 ${parts[0]} — ${legacyDay.title}`];
      legacyDay.exercises.forEach((exName, exIdx) => {
        const sets = setsForPrefix(dayLogs, `${exIdx}-`);
        if (sets) {
          const note = legacyNotes[dateKey]?.[`ex-${exIdx}`];
          lines.push(`  ${exName}: ${sets}${note ? ` — "${note}"` : ""}`);
        }
      });
      const workoutNote = legacyNotes[dateKey]?.["workout"];
      if (workoutNote) lines.push(`  📝 ${workoutNote}`);
      return lines.length > 1 ? lines.join("\n") : null;
    })
    .filter(Boolean)
    .join("\n");

  // Core exercise frequency summary
  const coreFreqAll: FreqMap = {};
  Object.entries(coreLogs).forEach(([, exercises]) => {
    Object.entries(exercises).forEach(([name, done]) => {
      if (done) coreFreqAll[name] = (coreFreqAll[name] || 0) + 1;
    });
  });
  const coreSummary = Object.keys(coreFreqAll).length > 0
    ? `\n\n📊 CORE / MOBILITY EXERCISE FREQUENCY (all time)\n` +
      Object.entries(coreFreqAll)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => `  ${name}: ×${count}`)
        .join("\n")
    : "";

  const legacySection = legacyFormatted
    ? `\n\n———\n📦 EARLIER HISTORY (pre-2026-09-30 program)\nLabeled with the exercise names in use at the time — different program structure.\n${legacyFormatted}`
    : "";

  const body = [formatted, coreSummary, legacySection].filter(Boolean).join("");
  const exportText = body
    ? `ELI'S WORKOUT LOG\nExported: ${new Date().toLocaleDateString()}\n${body}\n\n---\nPaste this into Claude and ask for progress analysis, trend spotting, or recommendations.`
    : "No workout data logged yet.";

  const copy = () => {
    navigator.clipboard.writeText(exportText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(60,50,40,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#DDD7CC", border: "1px solid #7A7268", borderRadius: "20px 20px 0 0", padding: "24px 24px 48px", width: "100%", maxWidth: "480px", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <div style={{ color: "#B85C38", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em" }}>EXPORT FOR CLAUDE</div>
            <div style={{ color: "#6A6258", fontSize: "11px", marginTop: "2px" }}>Copy → paste into a new Claude chat</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6A6258", fontSize: "22px", cursor: "pointer" }}>×</button>
        </div>
        <pre style={{
          flex: 1, overflow: "auto", background: "#F5F0E8", border: "1px solid #D8D2C8",
          borderRadius: "10px", padding: "14px", color: "#6A6258",
          fontSize: "11px", fontFamily: "'Space Mono', monospace", lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: "16px",
        }}>
          {exportText}
        </pre>
        <button onClick={copy} style={{
          width: "100%", padding: "16px",
          background: copied ? "#E0F0E0" : "#B85C38",
          border: `1px solid ${copied ? "#2a4a5a" : "transparent"}`,
          borderRadius: "12px", color: copied ? "#7EB8D4" : "#fff",
          fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.2s",
        }}>
          {copied ? "✓ COPIED TO CLIPBOARD" : "COPY TO CLIPBOARD"}
        </button>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function App() {
  const todayDow = new Date().getDay();
  const [activeDow, setActiveDow] = useState<number>(todayDow);
  const [allLogs, setAllLogs] = useState<AllLogs>({});
  const [coreLogs, setCoreLogs] = useState<CoreLogs>({});
  const [warmupLogs, setWarmupLogs] = useState<{ [dayKey: string]: boolean }>({});
  const [notesLogs, setNotesLogs] = useState<NotesLogs>({});
  const [showExport, setShowExport] = useState(false);
  const [activeExIdx, setActiveExIdx] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAllLogs(JSON.parse(stored) as AllLogs);
      const coreStored = localStorage.getItem(CORE_LOG_KEY);
      if (coreStored) setCoreLogs(JSON.parse(coreStored) as CoreLogs);
      const warmupStored = localStorage.getItem(WARMUP_LOG_KEY);
      if (warmupStored) setWarmupLogs(JSON.parse(warmupStored) as { [dayKey: string]: boolean });
      const notesStored = localStorage.getItem(NOTES_LOG_KEY);
      if (notesStored) setNotesLogs(JSON.parse(notesStored) as NotesLogs);
    } catch (_) {}
  }, []);

  // Persist to localStorage whenever logs change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allLogs)); } catch (_) {}
  }, [allLogs]);

  useEffect(() => {
    try { localStorage.setItem(CORE_LOG_KEY, JSON.stringify(coreLogs)); } catch (_) {}
  }, [coreLogs]);

  useEffect(() => {
    try { localStorage.setItem(WARMUP_LOG_KEY, JSON.stringify(warmupLogs)); } catch (_) {}
  }, [warmupLogs]);

  useEffect(() => {
    try { localStorage.setItem(NOTES_LOG_KEY, JSON.stringify(notesLogs)); } catch (_) {}
  }, [notesLogs]);

  const programDayIdx = DAY_MAP[activeDow] ?? null;
  const day = programDayIdx !== null ? PROGRAM_DAYS[programDayIdx] : null;
  const isRestDay = day === null;
  const accent = day?.color || "#6A6258";

  const isToday = activeDow === todayDow;
  const dayStorageKey = `${weekKey()}|${programDayIdx}`;

  const getDayLogs = (): DayLogs => allLogs[dayStorageKey] || {};

  const getLastSessionExLogs = (exIdx: number): { [setNum: number]: SetData } | null => {
    const currentWeek = weekKey();
    const matchingKeys = Object.keys(allLogs)
      .filter(k => k.endsWith(`|${programDayIdx}`) && !k.startsWith(currentWeek))
      .sort()
      .reverse();
    for (const key of matchingKeys) {
      const dayLogs = allLogs[key];
      const result: { [setNum: number]: SetData } = {};
      Object.entries(dayLogs).forEach(([k, v]) => {
        if (k.startsWith(`${exIdx}-`)) result[parseInt(k.split("-")[1]!)] = v;
      });
      if (Object.keys(result).length > 0) return result;
    }
    return null;
  };

  const getExLogs = (exIdx: number): { [setNum: number]: SetData } => {
    const dayLogs = getDayLogs();
    const result: { [setNum: number]: SetData } = {};
    Object.entries(dayLogs).forEach(([k, v]) => {
      if (k.startsWith(`${exIdx}-`)) result[parseInt(k.split("-")[1]!)] = v;
    });
    return result;
  };

  // Generic keyed logs for skill / tracked / core-calf entries. Keys look like
  // "skill-0-1" (prefix "skill-0-", setNum 1). The trailing segment after the
  // last "-" is the set number, so distinct prefixes never collide with the
  // numeric "exIdx-setNum" foundational keys.
  const getKeyedLogs = (prefix: string): { [setNum: number]: SetData } => {
    const dayLogs = getDayLogs();
    const result: { [setNum: number]: SetData } = {};
    Object.entries(dayLogs).forEach(([k, v]) => {
      if (k.startsWith(prefix)) {
        const setNum = parseInt(k.slice(prefix.length));
        if (!Number.isNaN(setNum)) result[setNum] = v;
      }
    });
    return result;
  };

  const getLastSessionKeyedLogs = (prefix: string): { [setNum: number]: SetData } | null => {
    const currentWeek = weekKey();
    const matchingKeys = Object.keys(allLogs)
      .filter(k => k.endsWith(`|${programDayIdx}`) && !k.startsWith(currentWeek))
      .sort()
      .reverse();
    for (const key of matchingKeys) {
      const dayLogs = allLogs[key];
      const result: { [setNum: number]: SetData } = {};
      Object.entries(dayLogs).forEach(([k, v]) => {
        if (k.startsWith(prefix)) {
          const setNum = parseInt(k.slice(prefix.length));
          if (!Number.isNaN(setNum)) result[setNum] = v;
        }
      });
      if (Object.keys(result).length > 0) return result;
    }
    return null;
  };

  const handleLogKeyed = (prefix: string, setNum: number, data: SetData) => {
    const key = `${prefix}${setNum}`;
    setAllLogs(prev => ({
      ...prev,
      [dayStorageKey]: { ...(prev[dayStorageKey] || {}), [key]: data },
    }));
  };

  const getExNote = (exIdx: number): string =>
    notesLogs[dayStorageKey]?.[`ex-${exIdx}`] ?? "";

  const handleExNoteChange = (exIdx: number, note: string) => {
    setNotesLogs(prev => ({
      ...prev,
      [dayStorageKey]: { ...(prev[dayStorageKey] || {}), [`ex-${exIdx}`]: note },
    }));
  };

  const workoutNote = notesLogs[dayStorageKey]?.["workout"] ?? "";

  const handleWorkoutNoteChange = (note: string) => {
    setNotesLogs(prev => ({
      ...prev,
      [dayStorageKey]: { ...(prev[dayStorageKey] || {}), workout: note },
    }));
  };

  const handleLogSet = (exIdx: number, setNum: number, data: SetData) => {
    const key = `${exIdx}-${setNum}`;
    setAllLogs(prev => ({
      ...prev,
      [dayStorageKey]: { ...(prev[dayStorageKey] || {}), [key]: data },
    }));
    if (!day) return;
    const ex = day.exercises[exIdx];
    if (!ex) return;
    const newCompletedSets = Object.keys(getExLogs(exIdx)).length + 1;
    if (newCompletedSets >= ex.sets && exIdx < day.exercises.length - 1) {
      setActiveExIdx(exIdx + 1);
    }
  };

  // Timer with notification on complete
  const timer = useTimer(() => {
    sendNotification("Rest Complete ✓", activeExIdx < (day?.exercises?.length ?? 0)
      ? `Next: ${day?.exercises[activeExIdx]?.name ?? ""}`
      : "All sets done — great work!");
  });

  const handleStartTimer = (exIdx: number, setNum: number) => {
    if (!day) return;
    const ex = day.exercises[exIdx];
    if (!ex) return;
    // Next set of same exercise, or first set of next exercise
    const nextSetOfSame = setNum < ex.sets ? setNum + 1 : null;
    const nextExercise = !nextSetOfSame ? day.exercises[exIdx + 1] : null;
    const nextLabel = nextSetOfSame
      ? `Set ${nextSetOfSame} of ${ex.name}`
      : nextExercise
        ? `Set 1 of ${nextExercise.name}`
        : null;
    timer.start(60);
    if (nextLabel) sendNotification("Rest Complete ✓", nextLabel);
  };

  const totalSets = day && day.kind === "foundational" ? day.exercises.reduce((a, ex) => a + ex.sets, 0) : 0;
  const doneSets  = day && day.kind === "foundational"
    ? day.exercises.reduce((a, _ex, i) => a + Object.keys(getExLogs(i)).length, 0)
    : 0;

  // Date for whichever day is selected in the strip
  const activeDayDate = new Date();
  activeDayDate.setDate(activeDayDate.getDate() + (activeDow - todayDow));
  const activeDateStr = activeDayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const activeDateLabel = isToday ? `TODAY · ${activeDateStr}` : activeDateStr;

  const nextEx = day && day.kind === "foundational" ? day.exercises[activeExIdx + 1] : null;

  // What to show in the rest timer banner
  const currentEx = day && day.kind === "foundational" ? day.exercises[activeExIdx] : null;
  const currentExCompletedSets = currentEx ? Object.keys(getExLogs(activeExIdx)).length : 0;
  const nextSetOfCurrent = currentEx && currentExCompletedSets < currentEx.sets
    ? `Set ${currentExCompletedSets + 1} of ${currentEx.name}`
    : null;
  const timerNextLabel = nextSetOfCurrent
    ?? (nextEx ? `Set 1 of ${nextEx.name}` : null);

  const handleCoreToggle = (exerciseName: string) => {
    const today = todayKey();
    setCoreLogs(prev => {
      const dayLog = { ...(prev[today] || {}) };
      dayLog[exerciseName] = !dayLog[exerciseName];
      return { ...prev, [today]: dayLog };
    });
  };

  const getCoreFreq = (): FreqMap => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const freq: FreqMap = {};
    Object.entries(coreLogs).forEach(([dateStr, exercises]) => {
      if (new Date(dateStr) >= cutoff) {
        Object.entries(exercises).forEach(([name, done]) => {
          if (done) freq[name] = (freq[name] || 0) + 1;
        });
      }
    });
    return freq;
  };

  const todayCoreChecked = coreLogs[todayKey()] || {};
  const coreFreq = getCoreFreq();

  const nextDayIdx = DAY_MAP[(activeDow + 1) % 7];
  const nextDayTitle = nextDayIdx !== null && nextDayIdx !== undefined
    ? PROGRAM_DAYS[nextDayIdx]?.title ?? null
    : null;

  return (
    <div className="app-outer" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,600;0,700;1,400&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
      {/* Phone shell — fixed iPhone Pro Max proportions on desktop, full-screen on mobile */}
      <div className="app-shell">

      {/* ── INNER LAYOUT: scrollable content + pinned timer ── */}
      <div className="app-inner">

        {/* Scrollable content area */}
        <div className="app-scroll">

      {/* ── HEADER ── */}
      <div style={{ padding: "28px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
          <span style={{ color: "#7A7268", fontSize: "11px", letterSpacing: "0.12em", fontWeight: 700 }}>ELI WORKOUT TRACKER</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "#7A7268", fontSize: "11px" }}>{activeDateLabel}</span>
            <button onClick={() => setShowExport(true)} style={{
              background: "#DDD7CC", border: "1px solid #D8D2C8", borderRadius: "6px",
              color: "#5A5248", fontSize: "10px", padding: "4px 10px", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", fontWeight: 700,
            }}>EXPORT</button>
          </div>
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "32px", fontWeight: 700, lineHeight: 1, color: isRestDay ? "#7A7268" : accent, marginBottom: "5px" }}>
          {isRestDay ? "REST DAY" : day.title}
        </div>
        <div style={{ color: "#7A7268", fontSize: "11px", letterSpacing: "0.06em" }}>
          {isRestDay ? "RECOVER · EAT · SLEEP" : day.subtitle.toUpperCase()}
        </div>
      </div>



      {/* ── DAY STRIP ── */}
      <div style={{ display: "flex", gap: "5px", padding: "16px 20px 0", overflowX: "auto", scrollbarWidth: "none" }}>
        {WEEK.map(w => {
          const isActive = w.dayIndex === activeDow;
          const isTodayDot = w.dayIndex === todayDow;
          const pIdx = DAY_MAP[w.dayIndex];
          const dayAccent = pIdx !== null && pIdx !== undefined ? PROGRAM_DAYS[pIdx]?.color ?? "#6A6258" : "#6A6258";

          // Check if a workout was completed this week for this day
          const currentWeekKey = weekKey();
          const wasCompleted = pIdx !== null && pIdx !== undefined &&
            Object.keys(allLogs).some(k => k.startsWith(currentWeekKey) && k.endsWith(`|${pIdx}`) && Object.keys(allLogs[k]).length > 0);

          const effectiveColor = wasCompleted ? "#2E6B4A" : dayAccent;
          const effectiveBg = wasCompleted ? "#E8E6E2" : isActive ? `${dayAccent}15` : "#EDE8DF";
          const effectiveBorder = wasCompleted ? "#4A7A62" : isActive ? dayAccent + "70" : "#D0CAC0";

          return (
            <button key={w.dayIndex} onClick={() => { setActiveDow(w.dayIndex); setActiveExIdx(0); }} style={{
              flexShrink: 0, padding: "9px 10px",
              background: effectiveBg,
              border: `1px solid ${effectiveBorder}`,
              borderRadius: "10px", cursor: "pointer",
              color: wasCompleted ? "#2E6B4A" : isActive ? dayAccent : "#7A7268",
              fontSize: "11px", fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center", minWidth: "42px", letterSpacing: "0.04em",
            }}>
              <div>{w.short}</div>
              <div style={{ marginTop: "5px", height: "4px", display: "flex", justifyContent: "center" }}>
                {isTodayDot && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: isActive ? effectiveColor : "#7A7268" }} />}
                {wasCompleted && !isTodayDot && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#2E6B4A" }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── PROGRESS BAR ── */}
      {!isRestDay && day?.kind === "foundational" && totalSets > 0 && (
        <div style={{ padding: "14px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#7A7268", fontSize: "11px", letterSpacing: "0.08em", fontWeight: 700 }}>SETS COMPLETED</span>
            <span style={{ color: doneSets === totalSets ? "#2E6B4A" : "#7A7268", fontSize: "11px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
              {doneSets} / {totalSets} · {totalSets ? Math.round((doneSets / totalSets) * 100) : 0}%
            </span>
          </div>
          <div style={{ background: "#DDD7CC", borderRadius: "3px", height: "2px" }}>
            <div style={{ height: "100%", borderRadius: "3px", background: doneSets === totalSets ? "#2E6B4A" : accent, width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%`, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div style={{ padding: "14px 20px 0" }}>
        {isRestDay ? (
          <>
            <RestDayView />
            <BedtimeSection />
          </>
        ) : day.kind === "progression" ? (
          <>
            {day.warmup.length > 0 && (
              <WarmupSection
                items={day.warmup}
                accent={accent}
                done={!!warmupLogs[dayStorageKey]}
                onDone={() => setWarmupLogs(prev => ({ ...prev, [dayStorageKey]: true }))}
              />
            )}

            {day.progressionNote && (
              <div style={{ background: "#EAF0F5", border: "1px solid #C8DCE8", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
                <span style={{ color: "#3A6A8A", fontSize: "12px", lineHeight: 1.5 }}>{day.progressionNote}</span>
              </div>
            )}

            {/* Mobility Session #1 checklist */}
            {day.pool && (
              <PoolDay day={day} todayChecked={todayCoreChecked} onToggle={handleCoreToggle} freq={coreFreq} />
            )}

            {/* Box pistols */}
            {day.skill && day.skill.length > 0 && (
              <CollapsibleSection title="Box Pistols" accent={accent}>
                {day.skill.map((sk, i) => (
                  <SkillCard
                    key={i} skill={sk} accent={accent}
                    logs={getKeyedLogs(`skill-${i}-`)}
                    lastSessionLogs={getLastSessionKeyedLogs(`skill-${i}-`)}
                    onLogSet={(setNum, data) => handleLogKeyed(`skill-${i}-`, setNum, data)}
                    onStartTimer={() => timer.start(60)}
                    onStopTimer={timer.stop}
                  />
                ))}
              </CollapsibleSection>
            )}

            {/* Tracked PR-style work */}
            {day.tracked && day.tracked.length > 0 && (
              <CollapsibleSection title="Tracked Work" accent={accent}>
                {day.tracked.map((tr, i) => (
                  <TrackedCard
                    key={i} ex={tr} accent={accent}
                    logs={getKeyedLogs(`tracked-${i}-`)}
                    lastSessionLogs={getLastSessionKeyedLogs(`tracked-${i}-`)}
                    onLogSet={(setNum, data) => handleLogKeyed(`tracked-${i}-`, setNum, data)}
                    onStartTimer={() => timer.start(60)}
                    onStopTimer={timer.stop}
                  />
                ))}
              </CollapsibleSection>
            )}

            {/* Workout notes */}
            <div style={{ marginTop: "4px", marginBottom: "4px" }}>
              <div style={{ color: "#7A7268", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "8px" }}>WORKOUT NOTES</div>
              <textarea
                value={workoutNote}
                onChange={e => handleWorkoutNoteChange(e.target.value)}
                placeholder="How did the session feel? Any PRs, issues, or things to remember..."
                rows={3}
                style={{
                  width: "100%", background: workoutNote ? "#E0DBD0" : "#EDE8DF",
                  border: `1px solid ${workoutNote ? "#B8B0A8" : "#D0CAC0"}`,
                  borderRadius: "10px", padding: "12px 14px",
                  color: "#3A3028", fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
                  resize: "none", outline: "none", boxSizing: "border-box",
                  lineHeight: 1.6, transition: "border-color 0.2s, background 0.2s",
                }}
                onFocus={e => { e.target.style.borderColor = accent; e.target.style.background = "#E0DBD0"; }}
                onBlur={e => { e.target.style.borderColor = workoutNote ? "#B8B0A8" : "#D0CAC0"; if (!workoutNote) e.target.style.background = "#EDE8DF"; }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
              />
            </div>

            {day.pm && <PMSection stretches={day.pm} nextDayTitle={nextDayTitle} />}
            <BedtimeSection />
          </>
        ) : day.kind === "mobility" ? (
          <>
            {/* Mobility Session #2 checklist */}
            <PoolDay
              day={day}
              todayChecked={todayCoreChecked}
              onToggle={handleCoreToggle}
              freq={coreFreq}
            />

            {/* Core & Calf */}
            {day.coreCalf && day.coreCalf.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <CollapsibleSection title="Core & Calf" accent={accent}>
                  {day.coreCalf.map((ex, i) => (
                    <TrackedCard
                      key={i}
                      ex={{ name: ex.name, sets: ex.sets, target: ex.reps, note: ex.note, unilateral: ex.unilateral, metric: "reps" }}
                      accent={accent}
                      logs={getKeyedLogs(`corecalf-${i}-`)}
                      lastSessionLogs={getLastSessionKeyedLogs(`corecalf-${i}-`)}
                      onLogSet={(setNum, data) => handleLogKeyed(`corecalf-${i}-`, setNum, data)}
                      onStartTimer={() => timer.start(60)}
                      onStopTimer={timer.stop}
                    />
                  ))}
                </CollapsibleSection>
              </div>
            )}

            {/* Box pistols */}
            {day.skill && day.skill.length > 0 && (
              <CollapsibleSection title="Box Pistols" accent={accent}>
                {day.skill.map((sk, i) => (
                  <SkillCard
                    key={i} skill={sk} accent={accent}
                    logs={getKeyedLogs(`skill-${i}-`)}
                    lastSessionLogs={getLastSessionKeyedLogs(`skill-${i}-`)}
                    onLogSet={(setNum, data) => handleLogKeyed(`skill-${i}-`, setNum, data)}
                    onStartTimer={() => timer.start(60)}
                    onStopTimer={timer.stop}
                  />
                ))}
              </CollapsibleSection>
            )}

            {day.pm && <PMSection stretches={day.pm} nextDayTitle={nextDayTitle} />}
            <BedtimeSection />
          </>
        ) : (
          <>
            {day.warmup.length > 0 && (
              <WarmupSection
                items={day.warmup}
                accent={accent}
                done={!!warmupLogs[dayStorageKey]}
                onDone={() => setWarmupLogs(prev => ({ ...prev, [dayStorageKey]: true }))}
              />
            )}
            <WorkoutSection
              exercises={day.exercises}
              accent={accent}
              doneSets={doneSets}
              totalSets={totalSets}
              activeExIdx={activeExIdx}
              getExLogs={getExLogs}
              getLastSessionExLogs={getLastSessionExLogs}
              onLogSet={handleLogSet}
              onStartTimer={handleStartTimer}
              onStopTimer={timer.stop}
              getExNote={getExNote}
              onExNoteChange={handleExNoteChange}
            />
            {doneSets === totalSets && totalSets > 0 && (
              <div style={{ marginTop: "20px", padding: "20px 16px", background: "#E8E6E2", border: "1px solid #4A7A62", borderRadius: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>💪</div>
                <div style={{ color: "#2E6B4A", fontWeight: 700, fontSize: "13px", fontFamily: "'Space Mono', monospace", letterSpacing: "0.06em" }}>WORKOUT COMPLETE</div>
                <div style={{ color: "#4A6A58", fontSize: "12px", marginTop: "4px" }}>{totalSets} sets logged · Hit your protein</div>
                {/* Export prompt after the last foundational day of the week (Fri = program day 4) */}
                {programDayIdx === 4 && (
                  <button onClick={() => setShowExport(true)} style={{
                    marginTop: "12px", background: "none", border: "1px solid #4A7A62",
                    borderRadius: "8px", color: "#2E6B4A", fontSize: "11px",
                    padding: "8px 16px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700, letterSpacing: "0.08em",
                  }}>EXPORT WEEK FOR CLAUDE →</button>
                )}
              </div>
            )}

            {/* ── WORKOUT NOTES ── */}
            <div style={{ marginTop: "16px", marginBottom: "4px" }}>
              <div style={{ color: "#7A7268", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "8px" }}>WORKOUT NOTES</div>
              <textarea
                value={workoutNote}
                onChange={e => handleWorkoutNoteChange(e.target.value)}
                placeholder="How did the session feel? Any PRs, issues, or things to remember..."
                rows={3}
                style={{
                  width: "100%", background: workoutNote ? "#E0DBD0" : "#EDE8DF",
                  border: `1px solid ${workoutNote ? "#B8B0A8" : "#D0CAC0"}`,
                  borderRadius: "10px", padding: "12px 14px",
                  color: "#3A3028", fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
                  resize: "none", outline: "none", boxSizing: "border-box",
                  lineHeight: 1.6, transition: "border-color 0.2s, background 0.2s",
                }}
                onFocus={e => { e.target.style.borderColor = accent; e.target.style.background = "#E0DBD0"; }}
                onBlur={e => { e.target.style.borderColor = workoutNote ? "#B8B0A8" : "#D0CAC0"; if (!workoutNote) e.target.style.background = "#EDE8DF"; }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
              />
            </div>
            {day.pm && <PMSection stretches={day.pm} nextDayTitle={nextDayTitle} />}
            <BedtimeSection />
          </>
        )}
      </div>

        </div>{/* end scrollable content */}

      </div>{/* end flex column / app-inner */}

      {/* ── TIMER OVERLAY — direct child of app-shell (position:relative) ── */}
      {timer.active && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(42,36,32,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 150,
        }}>
          <div style={{
            background: (timer.seconds ?? 0) <= 10 ? "#F0E8E0" : "#F5F0E8",
            border: `2px solid ${(timer.seconds ?? 0) <= 10 ? "#B85C38" : "#4A7FA5"}`,
            borderRadius: "24px", padding: "36px 40px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
            minWidth: "260px", transition: "border-color 0.4s, background 0.4s",
          }}>
            <div style={{ color: "#7A7268", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em" }}>RESTING</div>
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: "64px", fontWeight: 700, lineHeight: 1,
              color: (timer.seconds ?? 0) <= 10 ? "#B85C38" : "#4A7FA5",
              transition: "color 0.4s",
            }}>
              {String(Math.floor((timer.seconds ?? 0) / 60)).padStart(2, "0")}:{String((timer.seconds ?? 0) % 60).padStart(2, "0")}
            </span>
            {timerNextLabel && (
              <div style={{ color: "#7A7268", fontSize: "12px", textAlign: "center" }}>
                Next: <span style={{ color: "#2A2420", fontWeight: 600 }}>{timerNextLabel}</span>
              </div>
            )}
            <button onClick={timer.stop} style={{
              marginTop: "8px", background: "transparent",
              border: "1px solid #C8C0A8", borderRadius: "10px",
              color: "#7A7268", fontSize: "12px", fontWeight: 700,
              padding: "10px 32px", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.08em",
            }}>SKIP</button>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      {showExport && <ExportModal allLogs={allLogs} coreLogs={coreLogs} notesLogs={notesLogs} onClose={() => setShowExport(false)} />}
      </div>
    </div>
  );
}
