import { useState, useEffect, useRef, useCallback } from "react";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "eli_workout_logs_v1";
const CORE_LOG_KEY = "eli_core_logs_v1";
const NOTIF_PERM_KEY = "eli_notif_permission";

const WEEK = [
  { short: "SUN", dayIndex: 0 },
  { short: "MON", dayIndex: 1 },
  { short: "TUE", dayIndex: 2 },
  { short: "WED", dayIndex: 3 },
  { short: "THU", dayIndex: 4 },
  { short: "FRI", dayIndex: 5 },
  { short: "SAT", dayIndex: 6 },
];

const DAY_MAP = { 0: null, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: null };

const PROGRAM_DAYS = [
  {
    id: 0, title: "PUSH DAY", subtitle: "Chest · Shoulders · Triceps",
    color: "#B85C38", isPool: false,
    warmup: ["Band pull-aparts x15","Shoulder CARs x5/side","Scap push-ups x10","Light DB press x12"],
    exercises: [
      { name: "Incline Barbell Press",      sets: 4, reps: "6-8",    note: "Primary mover — push load relative to how you feel" },
      { name: "Seated DB Shoulder Press",   sets: 3, reps: "8-10",   note: "Controlled descent, full range" },
      { name: "Cable Chest Fly",            sets: 3, reps: "12",     note: "Mid/high anchors — pause at the squeeze" },
      { name: "Lateral Raises",             sets: 4, reps: "12-15",  note: "Slow eccentric, 3 sec down" },
      { name: "Overhead Triceps Extension", sets: 3, reps: "12",     note: "Cable or DB — long-head stretch at bottom" },
      { name: "Face Pulls",                 sets: 2, reps: "15",     note: "Shoulder health — don't skip" },
    ],
    pm: [
      { name: "Doorway Chest Stretch", duration: "60s each side", cue: "Arm at 90°, lean into doorframe — don't arch your lower back" },
      { name: "Cross-Body Shoulder Stretch", duration: "45s each side", cue: "Pull arm across chest, keep shoulder down" },
      { name: "Overhead Triceps Stretch", duration: "45s each side", cue: "Elbow behind head, gently pull with other hand" },
      { name: "Thread the Needle", duration: "45s each side", cue: "Thoracic rotation — shoulder reaches to floor" },
      { name: "Child's Pose with Arm Reach", duration: "60s", cue: "Walk hands to one side to hit lat — swap sides. Prepares lats for Pull day tomorrow." },
      { name: "Cat-Cow", duration: "10 slow reps", cue: "Decompress the spine before bed. Breathe deliberately." },
    ],
  },
  {
    id: 1, title: "CORE + MOBILITY", subtitle: "Recovery · Movement Quality",
    color: "#4A7FA5", isPool: true,
    warmup: [], exercises: [],
    pm: [
      { name: "Supine Spinal Twist", duration: "90s each side", cue: "Both shoulders stay on the floor — don't force the rotation" },
      { name: "Figure-4 / Pigeon", duration: "90s each side", cue: "Prioritize hip external rotation. Breathe into the tension." },
      { name: "Legs Up the Wall", duration: "3–5 min", cue: "Passive hamstring/low back relief — great before sleep" },
      { name: "Diaphragmatic Breathing", duration: "2 min", cue: "In through nose (belly rises), out slow through mouth. Activates parasympathetic." },
    ],
    pool: {
      "Anti-Extension Core": [
        { name: "Dead Bug",                cue: "Press lower back into floor, exhale fully at extension" },
        { name: "Ab Wheel Rollout",        cue: "Brace hard, don't let hips sag" },
        { name: "Plank with Shoulder Tap", cue: "Minimize hip rotation, breathe" },
        { name: "Hollow Body Hold",        cue: "Lower back stays pressed down, ribs in" },
        { name: "Ball Rollout",            cue: "Stability ball — more forgiving than ab wheel" },
        { name: "V-Ups",                   cue: "Full extension at bottom, crunch up to meet feet — keep lower back from arching" },
        { name: "Cable Crunch",            cue: "Kneel, pull elbows to knees — crunch from abs, not hip flexors" },
        { name: "Decline Leg Raise",       cue: "Control the descent — lower back stays pressed into pad" },
        { name: "Hanging Leg Raise",       cue: "Posterior pelvic tilt first, then raise — avoid swinging. Back-friendly when done right." },
      ],
      "Anti-Rotation / Lateral": [
        { name: "Pallof Press",            cue: "Press and hold — resist the cable pulling you sideways" },
        { name: "Side Plank",              cue: "Stacked or modified; add hip dip for progression" },
        { name: "Copenhagen Plank",        cue: "Bottom knee can touch floor to reduce load" },
        { name: "Single-Arm Farmer Carry", cue: "Tall posture, don't lean to the loaded side" },
        { name: "Cable Woodchop",          cue: "Rotate from hips, not lumbar" },
        { name: "Cable Lumberjack",        cue: "High-to-low diagonal pull — brace hard, rotate through thoracic not lumbar" },
      ],
      "Hip Hinge / Glute": [
        { name: "Glute Bridge",            cue: "Drive through heels, squeeze at top" },
        { name: "Single-Leg Glute Bridge", cue: "Keep pelvis level — don't let one side drop" },
        { name: "Hip Thrust",              cue: "Chin tucked, ribs down — avoid hyperextending lumbar" },
        { name: "Cable Pull-Through",      cue: "Hinge back, feel hamstring stretch, drive hips forward" },
        { name: "Reverse Hyper",           cue: "Low load only; great for lumbar pump/rehab" },
      ],
      "Mobility / Flow": [
        { name: "90/90 Hip Flow",          cue: "Controlled transitions, feel both internal/external rotation" },
        { name: "World's Greatest Stretch",cue: "Slow and deliberate, no bouncing" },
        { name: "Thoracic Rotation",       cue: "Keep lower back still, rotate mid-back only" },
        { name: "Hip Flexor Stretch",      cue: "Posterior pelvic tilt first, then lean forward" },
        { name: "Cat-Cow",                 cue: "Exhale into flexion, inhale into extension" },
        { name: "Thread the Needle",       cue: "Shoulder to floor — great thoracic opener" },
        { name: "Pigeon / Figure-4",       cue: "Figure-4 is safer if pigeon is too intense" },
        { name: "Ankle Mobility Work",     cue: "Important for squat depth and knee health" },
      ],
      "Cardio": [
        { name: "Incline Treadmill Walk",  cue: "10–12% incline, 20–40 min — great for glutes too" },
        { name: "Stationary Bike",         cue: "Keep RPE low; this is active recovery" },
        { name: "Elliptical",              cue: "Low joint stress — good if legs are sore" },
        { name: "High Knees",              cue: "Drive knees to hip height, stay on balls of feet — good finisher or warm-up within the session" },
      ],
    },
  },
  {
    id: 2, title: "PULL DAY", subtitle: "Back · Traps · Biceps",
    color: "#B85C38", isPool: false,
    warmup: ["Face pulls x15","Scap pull-ups x6","T-spine extensions x8"],
    exercises: [
      { name: "Rack Pull (below knee)",    sets: 4, reps: "5-6",     note: "Lighter than you think first session — brace hard, neutral spine" },
      { name: "Cable Row (neutral grip)",  sets: 3, reps: "8-10",    note: "Full scapular retraction at top" },
      { name: "Lat Pulldown (wide grip)",  sets: 3, reps: "8-10",    note: "Solid foundation — keep it" },
      { name: "Single-Arm DB Row",         sets: 3, reps: "10/side", note: "Brace core, don't rotate" },
      { name: "Rear Delt Fly",             sets: 3, reps: "15",      note: "Machine or cable — light weight, focus on squeeze" },
      { name: "EZ Bar Curl",               sets: 3, reps: "10",      note: "Easier on wrists than straight bar" },
      { name: "Hammer Curls",              sets: 2, reps: "12",      note: "Brachialis + forearm strength" },
    ],
    pm: [
      { name: "Child's Pose with Lat Reach", duration: "60s each side", cue: "Walk hands far to each side — feel the lat lengthen. Priority after rack pulls." },
      { name: "Doorway Biceps Stretch", duration: "45s each side", cue: "Arm straight back at shoulder height, rotate away. Forearm flush with wall." },
      { name: "Supine Spinal Twist", duration: "60s each side", cue: "Decompress the spine after all that pulling. Both shoulders down." },
      { name: "Neck Side Stretch", duration: "30s each side", cue: "Ear toward shoulder, hand gently adds weight. Upper trap release." },
      { name: "Hip Flexor Stretch (kneeling)", duration: "60s each side", cue: "Posterior tilt first — prepares hip flexors for Lower day tomorrow." },
      { name: "Ankle Circles + Dorsiflexion", duration: "30s each side", cue: "2 min total. Easy prep for squatting tomorrow." },
    ],
  },
  {
    id: 3, title: "LOWER + CORE", subtitle: "Quads · Glutes · Hamstrings",
    color: "#B85C38", isPool: false,
    warmup: ["Hip rocks x10","Ankle mobility x10","BW squats x10","90/90 hip switches x8"],
    exercises: [
      { name: "Goblet Squat",              sets: 4, reps: "6-8",    note: "Front squat on hold — wrist/t-spine mobility not there yet. Goblet trains the same pattern, no compromise." },
      { name: "Romanian Deadlift",         sets: 3, reps: "10",     note: "Hinge with control — neutral spine always. Warm hamstrings first." },
      { name: "Bulgarian Split Squat",     sets: 3, reps: "8/leg",  note: "More stable than lunges, better glute loading" },
      { name: "Leg Curl (machine)",        sets: 3, reps: "12",     note: "Hamstring balance — important post-back surgery" },
      { name: "Cable Pull-Through",        sets: 3, reps: "15",     note: "Glute/hip hinge with zero spinal compression" },
      { name: "Dead Bug",                  sets: 3, reps: "8/side", note: "Core finisher — breathe out at full extension" },
    ],
    pm: [
      { name: "Standing Hamstring Stretch", duration: "60s each side", cue: "Foot on low surface, hinge at hip — don't round your back. Essential given your cramping history." },
      { name: "Figure-4 Glute Stretch", duration: "90s each side", cue: "On back, ankle over opposite knee. Pull toward chest. Deep glute release." },
      { name: "Couch Stretch (hip flexor)", duration: "60s each side", cue: "Back knee on floor, front foot forward — squeeze glute of back leg. Key for squat recovery." },
      { name: "Calf Stretch (straight + bent knee)", duration: "45s each", cue: "Straight leg = gastrocnemius. Bent knee = soleus. Do both — addresses cramping." },
      { name: "Supine Spinal Twist", duration: "60s each side", cue: "Knees stacked and together. Lower back decompression after squatting and hinging." },
      { name: "Legs Up the Wall", duration: "3 min", cue: "Passive hamstring/low back reset. Good wind-down before sleep." },
    ],
  },
  {
    id: 4, title: "CORE + MOBILITY", subtitle: "Recovery · Movement Quality",
    color: "#4A7FA5", isPool: true,
    warmup: [], exercises: [],
    pm: [
      { name: "Figure-4 / Pigeon", duration: "90s each side", cue: "End of week — give the hips extra time here" },
      { name: "Doorway Chest Stretch", duration: "60s each side", cue: "Light chest opener heading into the weekend" },
      { name: "Supine Spinal Twist", duration: "60s each side", cue: "Full spinal reset to close the training week" },
      { name: "Legs Up the Wall", duration: "5 min", cue: "Earned it. Let the whole posterior chain drain out." },
      { name: "Diaphragmatic Breathing", duration: "3 min", cue: "Slow it all the way down. Parasympathetic reset for the weekend." },
    ],
    pool: {
      "Anti-Extension Core": [
        { name: "Dead Bug",                cue: "Press lower back into floor, exhale fully at extension" },
        { name: "Ab Wheel Rollout",        cue: "Brace hard, don't let hips sag" },
        { name: "Reverse Crunch",          cue: "Curl pelvis up, don't just swing legs" },
        { name: "Hollow Body Hold",        cue: "Lower back stays pressed down, ribs in" },
        { name: "V-Ups",                   cue: "Full extension at bottom, crunch up to meet feet — keep lower back from arching" },
        { name: "Cable Crunch",            cue: "Kneel, pull elbows to knees — crunch from abs, not hip flexors" },
        { name: "Decline Leg Raise",       cue: "Control the descent — lower back stays pressed into pad" },
        { name: "Hanging Leg Raise",       cue: "Posterior pelvic tilt first, then raise — avoid swinging. Back-friendly when done right." },
      ],
      "Anti-Rotation / Lateral": [
        { name: "Pallof Press",            cue: "Press and hold — resist the cable pulling you sideways" },
        { name: "Side Plank",              cue: "Stacked or modified; add hip dip for progression" },
        { name: "Single-Arm Farmer Carry", cue: "Tall posture, don't lean to the loaded side" },
        { name: "Cable Lumberjack",        cue: "High-to-low diagonal pull — brace hard, rotate through thoracic not lumbar" },
      ],
      "Hip Hinge / Glute": [
        { name: "Glute Bridge",            cue: "Drive through heels, squeeze at top" },
        { name: "Hip Thrust",              cue: "Chin tucked, ribs down — avoid hyperextending lumbar" },
        { name: "Cable Pull-Through",      cue: "Hinge back, feel hamstring stretch, drive hips forward" },
      ],
      "Mobility / Flow": [
        { name: "90/90 Hip Flow",          cue: "Controlled transitions, feel both internal/external rotation" },
        { name: "World's Greatest Stretch",cue: "Slow and deliberate, no bouncing" },
        { name: "Thoracic Rotation",       cue: "Keep lower back still, rotate mid-back only" },
        { name: "Cat-Cow",                 cue: "Exhale into flexion, inhale into extension" },
        { name: "Thread the Needle",       cue: "Shoulder to floor — great thoracic opener" },
      ],
      "Cardio": [
        { name: "Incline Treadmill Walk",  cue: "10–12% incline, 20–40 min" },
        { name: "Stationary Bike",         cue: "Keep RPE low; this is active recovery" },
        { name: "High Knees",              cue: "Drive knees to hip height, stay on balls of feet — good finisher or warm-up within the session" },
      ],
    },
  },
];

const REST_TIPS = [
  { label: "Sleep is Training", body: "7–9 hours is when growth hormone peaks. This is when your body actually builds muscle." },
  { label: "Protein still matters", body: "Don't drop intake on rest days. Muscle repairs around the clock — keep it at 0.8–1g per lb." },
  { label: "Hydration + Magnesium", body: "Magnesium glycinate before bed helps with cramping and sleep quality. Especially relevant for you." },
  { label: "Plan tomorrow", body: "Check which day is next and know what you're walking into. Remove friction tonight." },
];

const POOL_COLORS = {
  "Anti-Extension Core": "#B85C38",
  "Anti-Rotation / Lateral": "#A0522D",
  "Hip Hinge / Glute": "#4A7FA5",
  "Mobility / Flow": "#5B8FA8",
  "Cardio": "#6B9DB8",
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-04-27"
}

function sendNotification(title, body) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "/favicon.ico", silent: false }); } catch (_) {}
  }
}

async function requestNotifPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

// ── TIMER HOOK ────────────────────────────────────────────────────────────────

function useTimer(onComplete) {
  const [seconds, setSeconds] = useState(null);
  const ref = useRef(null);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  const start = useCallback((s = 90) => {
    if (ref.current) clearInterval(ref.current);
    setSeconds(s);
    ref.current = setInterval(() => {
      setSeconds(p => {
        if (p <= 1) {
          clearInterval(ref.current);
          cbRef.current?.();
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  }, []);

  const stop = useCallback(() => { clearInterval(ref.current); setSeconds(null); }, []);
  useEffect(() => () => clearInterval(ref.current), []);
  return { seconds, start, stop, active: seconds !== null };
}

// ── SET MODAL ─────────────────────────────────────────────────────────────────

function SetModal({ setNum, totalSets, suggested, onSave, onClose }) {
  // null = user hasn't typed yet (show suggestion dimmed), string = user typed
  const [weight, setWeight] = useState(null);
  const [reps,   setReps]   = useState(null);

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
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#1a1714", border: "1px solid #242424",
        borderRadius: "20px 20px 0 0", padding: "24px 24px 48px",
        width: "100%", maxWidth: "480px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ color: "#444", fontSize: "11px", letterSpacing: "0.12em", fontWeight: 700 }}>
            LOG SET {setNum} <span style={{ color: "#2a2a2a" }}>/ {totalSets}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#333", fontSize: "20px", cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
          {/* WEIGHT */}
          <div style={{ flex: 1 }}>
            <label style={{ color: "#444", fontSize: "11px", display: "block", marginBottom: "8px", letterSpacing: "0.08em" }}>WEIGHT (lbs)</label>
            <input
              type="number" inputMode="decimal"
              value={displayWeight}
              autoFocus
              onFocus={e => e.target.select()}
              onChange={e => setWeight(e.target.value)}
              style={{
                width: "100%", background: "#131110",
                border: `1px solid ${weightIsDefault ? "#252015" : "#202020"}`,
                borderRadius: "12px", padding: "16px 12px",
                color: weightIsDefault ? "#6a5a3a" : "#F2EDE4",
                fontSize: "30px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
                outline: "none", boxSizing: "border-box", textAlign: "center",
                transition: "color 0.15s, border-color 0.15s",
              }}
            />
          </div>
          {/* REPS */}
          <div style={{ flex: 1 }}>
            <label style={{ color: "#444", fontSize: "11px", display: "block", marginBottom: "8px", letterSpacing: "0.08em" }}>REPS</label>
            <input
              type="number" inputMode="decimal"
              value={displayReps}
              onFocus={e => e.target.select()}
              onChange={e => setReps(e.target.value)}
              style={{
                width: "100%", background: "#131110",
                border: `1px solid ${repsIsDefault ? "#252015" : "#202020"}`,
                borderRadius: "12px", padding: "16px 12px",
                color: repsIsDefault ? "#6a5a3a" : "#F2EDE4",
                fontSize: "30px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
                outline: "none", boxSizing: "border-box", textAlign: "center",
                transition: "color 0.15s, border-color 0.15s",
              }}
            />
          </div>
        </div>

        {/* Hint label */}
        {(weightIsDefault || repsIsDefault) && (
          <div style={{ color: "#3a3020", fontSize: "11px", textAlign: "center", marginBottom: "16px", fontStyle: "italic" }}>
            from last session — type to change
          </div>
        )}
        {(!weightIsDefault && !repsIsDefault) && <div style={{ marginBottom: "16px" }} />}

        <button onClick={handleSave} style={{
          width: "100%", padding: "17px", background: "#B85C38",
          border: "none", borderRadius: "12px", color: "#0e0c0b",
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

function WarmupSection({ items, accent }) {
  const [done, setDone] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCheck = () => {
    setDone(true);
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
          <span style={{ color: done ? accent : "#242424", fontSize: "11px", letterSpacing: "0.1em", fontWeight: 700 }}>
            WARM-UP
          </span>
          {done && <span style={{ color: accent, fontSize: "11px", fontWeight: 700 }}>✓ DONE</span>}
        </div>
        <span style={{ color: "#2a2a2a", fontSize: "14px" }}>{collapsed ? "+" : "−"}</span>
      </button>

      {!collapsed && (
        <div style={{
          background: done ? `${accent}08` : "#141210",
          border: `1px solid ${done ? accent + "30" : "#1e1e1e"}`,
          borderRadius: "10px", padding: "12px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "12px", transition: "all 0.3s",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", flex: 1 }}>
            {items.map(w => (
              <span key={w} style={{
                color: done ? "#3a3030" : "#444", fontSize: "12px",
                textDecoration: done ? "line-through" : "none",
                transition: "all 0.3s",
              }}>
                {w}{" "}
              </span>
            ))}
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (!done) handleCheck(); }}
            style={{
              width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
              background: done ? accent : "transparent",
              border: `2px solid ${done ? accent : "#2a2a2a"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: done ? "default" : "pointer", transition: "all 0.25s",
            }}
          >
            {done && <span style={{ color: "#0e0c0b", fontSize: "14px", fontWeight: 700 }}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}

// ── EXERCISE CARD ─────────────────────────────────────────────────────────────

function ExerciseCard({ ex, exIdx, accent, logs, lastSessionLogs, isCurrent, isNext, onLogSet, onStartTimer }) {
  const [modal, setModal] = useState(null);
  const completedSets = Object.keys(logs).length;
  const allDone = completedSets >= ex.sets;

  // Smart suggestion: previous set this session, or matching set from last session
  const getSuggested = (setNum) => {
    if (setNum > 1 && logs[setNum - 1]) return logs[setNum - 1];
    if (lastSessionLogs?.[setNum]) return lastSessionLogs[setNum];
    if (lastSessionLogs?.[1]) return lastSessionLogs[1];
    return null;
  };

  return (
    <>
      <div style={{
        background: allDone ? "#0f1520" : isCurrent ? "#131310" : "#0f0f0f",
        border: `1px solid ${allDone ? "#1a2a3a" : isCurrent ? accent + "50" : "#1a1a1a"}`,
        borderRadius: "14px", padding: "16px",
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
            background: "linear-gradient(90deg, #2a2a2a, transparent)" }} />
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div style={{ flex: 1, paddingRight: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: allDone ? "#7EB8D4" : isCurrent ? "#f0f0f0" : "#888", fontWeight: 700, fontSize: "14px", lineHeight: 1.3 }}>
                {allDone ? "✓ " : ""}{ex.name}
              </span>
              {isNext && !allDone && (
                <span style={{ color: "#2a2a2a", fontSize: "10px", letterSpacing: "0.08em", fontWeight: 700, flexShrink: 0 }}>UP NEXT</span>
              )}
            </div>
            {ex.note && <div style={{ color: "#3a3a3a", fontSize: "12px", marginTop: "3px", fontStyle: "italic", lineHeight: 1.4 }}>{ex.note}</div>}
          </div>
          <span style={{
            color: allDone ? "#7EB8D4" : isCurrent ? accent : "#333",
            fontSize: "11px", fontWeight: 700, fontFamily: "'Space Mono', monospace",
            background: allDone ? "#1a3a1a" : isCurrent ? `${accent}18` : "#141414",
            padding: "5px 9px", borderRadius: "6px", flexShrink: 0, whiteSpace: "nowrap",
          }}>
            {ex.sets}×{ex.reps}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {Array.from({ length: ex.sets }).map((_, i) => {
            const setNum = i + 1;
            const log = logs[setNum];
            const done = !!log;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <button
                  onClick={() => setModal(setNum)}
                  style={{
                    width: "46px", height: "46px", borderRadius: "50%",
                    background: done ? accent : isCurrent ? "#1e1e1a" : "#141414",
                    border: `2px solid ${done ? accent : isCurrent ? accent + "40" : "#222"}`,
                    color: done ? "#000" : isCurrent ? "#666" : "#333",
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
                  <span style={{ color: "#3a3a3a", fontSize: "10px", fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
                    {log.weight}{log.reps ? `×${log.reps}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal !== null && (
        <SetModal
          setNum={modal} totalSets={ex.sets} suggested={getSuggested(modal)}
          onSave={data => { onLogSet(exIdx, modal, data); setModal(null); onStartTimer(); }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── PM STRETCH SECTION ────────────────────────────────────────────────────────

function PMSection({ stretches, nextDayTitle }) {
  const [collapsed, setCollapsed] = useState(true);
  const [checked, setChecked] = useState({});
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
          <span style={{ fontSize: "14px" }}>🌙</span>
          <span style={{ color: allDone ? "#4A7FA5" : "#444", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em" }}>
            PM STRETCHES
          </span>
          {allDone && <span style={{ color: "#4A7FA5", fontSize: "11px", fontWeight: 700 }}>✓ DONE</span>}
          {!allDone && doneCount > 0 && (
            <span style={{ color: "#2a2a2a", fontSize: "11px", fontFamily: "'Space Mono', monospace" }}>{doneCount}/{stretches.length}</span>
          )}
        </div>
        <span style={{ color: "#2a2a2a", fontSize: "14px" }}>{collapsed ? "+" : "−"}</span>
      </button>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {nextDayTitle && (
            <div style={{ color: "#2a3a4a", fontSize: "11px", marginBottom: "4px", fontStyle: "italic" }}>
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
                  display: "flex", alignItems: "flex-start", gap: "12px",
                  background: done ? "#0c1520" : "#0f0f0f",
                  border: `1px solid ${done ? "#1a2a3a" : "#1a1a1a"}`,
                  borderRadius: "10px", padding: "12px 14px",
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.2s",
                }}
              >
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                  background: done ? "#4A7FA5" : "transparent",
                  border: `1.5px solid ${done ? "#4A7FA5" : "#2a2a2a"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}>
                  {done && <span style={{ color: "#0e0c0b", fontSize: "10px", fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ color: done ? "#2a3a4a" : "#C8BFB0", fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>
                      {s.name}
                    </span>
                    <span style={{ color: done ? "#1a2a3a" : "#4A7FA5", fontSize: "11px", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
                      {s.duration}
                    </span>
                  </div>
                  <div style={{ color: done ? "#1e2a3a" : "#3a3a3a", fontSize: "12px", fontStyle: "italic", lineHeight: 1.4 }}>
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

function PoolDay({ day, todayChecked, onToggle, freq }) {
  const [open, setOpen] = useState(null);
  const checkedCount = Object.values(todayChecked).filter(Boolean).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
        <p style={{ color: "#444", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
          Pick 2–3 per category, finish with cardio. Tap ✓ when done.
        </p>
        {checkedCount > 0 && (
          <span style={{ color: "#4A7FA5", fontSize: "11px", fontFamily: "'Space Mono', monospace", flexShrink: 0, marginLeft: "8px" }}>
            {checkedCount} done
          </span>
        )}
      </div>
      {Object.entries(day.pool).map(([cat, items]) => {
        const isOpen = open === cat;
        const color = POOL_COLORS[cat] || "#888";
        const catChecked = items.filter(item => todayChecked[item.name]).length;
        return (
          <div key={cat} style={{ marginBottom: "6px", border: `1px solid ${isOpen ? color + "55" : "#1a1a1a"}`, borderRadius: "12px", overflow: "hidden", transition: "border-color 0.2s" }}>
            <button onClick={() => setOpen(isOpen ? null : cat)} style={{
              width: "100%", background: isOpen ? `${color}10` : "#0f0f0f",
              border: "none", padding: "13px 16px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: "pointer", color: isOpen ? color : "#444",
              fontSize: "11px", fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: catChecked > 0 ? color : "#2a2a2a", flexShrink: 0, transition: "background 0.2s" }} />
                {cat}
                {catChecked > 0 && (
                  <span style={{ color, fontSize: "10px", fontWeight: 700 }}>×{catChecked}</span>
                )}
              </span>
              <span style={{ fontSize: "16px", opacity: 0.4 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div style={{ background: "#0a0a0a" }}>
                {items.map((item) => {
                  const done = !!todayChecked[item.name];
                  const count = freq[item.name] || 0;
                  const isHeavy = count >= 6;
                  const isLight = count <= 1;
                  return (
                    <div key={item.name} style={{
                      padding: "11px 14px", borderTop: "1px solid #141414",
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
                          border: `1.5px solid ${done ? color : "#2a2a2a"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "all 0.2s",
                        }}
                      >
                        {done && <span style={{ color: "#0e0c0b", fontSize: "11px", fontWeight: 700 }}>✓</span>}
                      </button>

                      {/* Name + cue */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: done ? "#4a4a4a" : "#BEB5A6", fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>
                          {item.name}
                        </div>
                        <div style={{ color: "#3a3a3a", fontSize: "12px", marginTop: "2px", fontStyle: "italic" }}>{item.cue}</div>
                      </div>

                      {/* 4-week frequency badge */}
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        {count > 0 ? (
                          <span style={{
                            fontSize: "10px", fontFamily: "'Space Mono', monospace", fontWeight: 700,
                            color: isHeavy ? "#8a4a2a" : isLight ? "#4A7FA5" : "#3a3a3a",
                            background: isHeavy ? "#1a0e08" : isLight ? "#0a1220" : "transparent",
                            padding: isHeavy || isLight ? "2px 6px" : "0",
                            borderRadius: "4px",
                          }}>
                            ×{count}
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", color: "#2a2a2a", fontFamily: "'Space Mono', monospace" }}>new</span>
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
        <div key={i} style={{ background: "#141210", border: "1px solid #1a1a1a", borderRadius: "12px", padding: "14px 16px", marginBottom: "8px" }}>
          <span style={{ color: "#B85C38", fontWeight: 700, fontSize: "13px" }}>{tip.label}. </span>
          <span style={{ color: "#555", fontSize: "13px", lineHeight: 1.5 }}>{tip.body}</span>
        </div>
      ))}
    </div>
  );
}

// ── LOG EXPORT MODAL ──────────────────────────────────────────────────────────

function ExportModal({ allLogs, coreLogs, onClose }) {
  const [copied, setCopied] = useState(false);

  const formatted = Object.entries(allLogs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayLogs]) => {
      const [dow, programIdx] = dateKey.split("|");
      const day = PROGRAM_DAYS[parseInt(programIdx)];
      if (!day || day.isPool) return null;
      const lines = [`\n📅 ${dateKey.split("|")[0]} — ${day.title}`];
      day.exercises.forEach((ex, exIdx) => {
        const sets = Object.entries(dayLogs)
          .filter(([k]) => k.startsWith(`${exIdx}-`))
          .sort(([a], [b]) => parseInt(a.split("-")[1]) - parseInt(b.split("-")[1]))
          .map(([, v]) => `${v.weight || "?"}lbs × ${v.reps || "?"}`)
          .join(", ");
        if (sets) lines.push(`  ${ex.name}: ${sets}`);
      });
      return lines.join("\n");
    })
    .filter(Boolean)
    .join("\n");

  // Core exercise frequency summary
  const coreFreqAll = {};
  Object.entries(coreLogs).forEach(([, exercises]) => {
    Object.entries(exercises).forEach(([name, done]) => {
      if (done) coreFreqAll[name] = (coreFreqAll[name] || 0) + 1;
    });
  });
  const coreSummary = Object.keys(coreFreqAll).length > 0
    ? `\n\n📊 CORE EXERCISE FREQUENCY (all time)\n` +
      Object.entries(coreFreqAll)
        .sort(([,a],[,b]) => b - a)
        .map(([name, count]) => `  ${name}: ×${count}`)
        .join("\n")
    : "";

  const exportText = formatted
    ? `ELI'S WORKOUT LOG\nExported: ${new Date().toLocaleDateString()}\n${formatted}${coreSummary}\n\n---\nPaste this into Claude and ask for progress analysis, trend spotting, or recommendations.`
    : "No workout data logged yet.";

  const copy = () => {
    navigator.clipboard.writeText(exportText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1a1714", border: "1px solid #242424", borderRadius: "20px 20px 0 0", padding: "24px 24px 48px", width: "100%", maxWidth: "480px", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <div style={{ color: "#B85C38", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em" }}>EXPORT FOR CLAUDE</div>
            <div style={{ color: "#333", fontSize: "11px", marginTop: "2px" }}>Copy → paste into a new Claude chat</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#333", fontSize: "22px", cursor: "pointer" }}>×</button>
        </div>
        <pre style={{
          flex: 1, overflow: "auto", background: "#0e0c0b", border: "1px solid #1a1a1a",
          borderRadius: "10px", padding: "14px", color: "#555",
          fontSize: "11px", fontFamily: "'Space Mono', monospace", lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: "16px",
        }}>
          {exportText}
        </pre>
        <button onClick={copy} style={{
          width: "100%", padding: "16px",
          background: copied ? "#1a3a1a" : "#B85C38",
          border: `1px solid ${copied ? "#2a4a5a" : "transparent"}`,
          borderRadius: "12px", color: copied ? "#7EB8D4" : "#000",
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
  const [activeDow, setActiveDow] = useState(todayDow);
  const [allLogs, setAllLogs] = useState({});
  const [coreLogs, setCoreLogs] = useState({}); // { "YYYY-MM-DD": { "Exercise Name": true } }   // { "YYYY-MM-DD|programIdx": { "exIdx-setNum": {weight,reps} } }
  const [showExport, setShowExport] = useState(false);
  const [notifStatus, setNotifStatus] = useState("unknown");
  const [activeExIdx, setActiveExIdx] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAllLogs(JSON.parse(stored));
      const coreStored = localStorage.getItem(CORE_LOG_KEY);
      if (coreStored) setCoreLogs(JSON.parse(coreStored));
    } catch (_) {}
    // Check notification permission
    if (typeof Notification !== "undefined") setNotifStatus(Notification.permission);
  }, []);

  // Persist to localStorage whenever logs change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allLogs)); } catch (_) {}
  }, [allLogs]);

  useEffect(() => {
    try { localStorage.setItem(CORE_LOG_KEY, JSON.stringify(coreLogs)); } catch (_) {}
  }, [coreLogs]);

  const programDayIdx = DAY_MAP[activeDow];
  const day = programDayIdx !== null ? PROGRAM_DAYS[programDayIdx] : null;
  const isRestDay = day === null;
  const accent = day?.color || "#555";

  // Build day storage key: "YYYY-MM-DD|programIdx"  (only today writes; other days read-only)
  const isToday = activeDow === todayDow;
  const dayStorageKey = `${todayKey()}|${programDayIdx}`;

  const getDayLogs = () => allLogs[dayStorageKey] || {};

  // Find the most recent previous session logs for this program day + exercise
  const getLastSessionExLogs = (exIdx) => {
    const todayStr = todayKey();
    const matchingKeys = Object.keys(allLogs)
      .filter(k => k.endsWith(`|${programDayIdx}`) && !k.startsWith(todayStr))
      .sort()
      .reverse(); // most recent first
    for (const key of matchingKeys) {
      const dayLogs = allLogs[key];
      const result = {};
      Object.entries(dayLogs).forEach(([k, v]) => {
        if (k.startsWith(`${exIdx}-`)) result[parseInt(k.split("-")[1])] = v;
      });
      if (Object.keys(result).length > 0) return result;
    }
    return null;
  };

  const getExLogs = (exIdx) => {
    const dayLogs = getDayLogs();
    const result = {};
    Object.entries(dayLogs).forEach(([k, v]) => {
      if (k.startsWith(`${exIdx}-`)) result[parseInt(k.split("-")[1])] = v;
    });
    return result;
  };

  const handleLogSet = (exIdx, setNum, data) => {
    const key = `${exIdx}-${setNum}`;
    setAllLogs(prev => ({
      ...prev,
      [dayStorageKey]: { ...(prev[dayStorageKey] || {}), [key]: data },
    }));
    // Advance active exercise tracker
    const ex = day.exercises[exIdx];
    const newCompletedSets = Object.keys(getExLogs(exIdx)).length + 1;
    if (newCompletedSets >= ex.sets && exIdx < day.exercises.length - 1) {
      setActiveExIdx(exIdx + 1);
    }
  };

  // Timer with notification on complete
  const timer = useTimer(() => {
    sendNotification("Rest Complete ✓", activeExIdx < (day?.exercises?.length ?? 0)
      ? `Next: ${day.exercises[activeExIdx]?.name}`
      : "All sets done — great work!");
  });

  const handleStartTimer = (exIdx) => {
    const nextEx = day?.exercises?.[exIdx + 1];
    timer.start(90);
    sendNotification(
      `Set logged · Rest 90s`,
      nextEx ? `Up next: ${nextEx.name}` : "Last exercise — finish strong"
    );
  };

  const totalSets = day && !day.isPool ? day.exercises.reduce((a, ex) => a + ex.sets, 0) : 0;
  const doneSets  = day && !day.isPool
    ? day.exercises.reduce((a, ex, i) => a + Object.keys(getExLogs(i)).length, 0)
    : 0;

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const nextEx = day && !day.isPool ? day.exercises[activeExIdx + 1] : null;

  const handleCoreToggle = (exerciseName) => {
    const today = todayKey();
    setCoreLogs(prev => {
      const dayLog = { ...(prev[today] || {}) };
      dayLog[exerciseName] = !dayLog[exerciseName];
      return { ...prev, [today]: dayLog };
    });
  };

  // 4-week frequency: count how many sessions each exercise was checked
  const getCoreFreq = () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const freq = {};
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

  const handleNotifRequest = async () => {
    const result = await requestNotifPermission();
    setNotifStatus(result);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0e0c0b", minHeight: "100vh", color: "#F2EDE4", maxWidth: "480px", margin: "0 auto", paddingBottom: timer.active ? "140px" : "60px", transition: "padding 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,600;0,700;1,400&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />

      {/* ── TIMER BANNER (BOTTOM) ── */}
      {timer.active && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: "480px",
          background: timer.seconds <= 10 ? "#1a0a08" : "#080c12",
          borderTop: `2px solid ${timer.seconds <= 10 ? "#B85C38" : "#4A7FA5"}`,
          padding: "16px 24px 32px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          zIndex: 50, transition: "background 0.5s",
        }}>
          <div>
            <div style={{ color: "#3a3a3a", fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", marginBottom: "2px" }}>RESTING</div>
            {nextEx && <div style={{ color: "#4a4a4a", fontSize: "12px" }}>Next: {nextEx.name}</div>}
          </div>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "32px", fontWeight: 700, color: timer.seconds <= 10 ? "#B85C38" : "#7EB8D4" }}>
            {String(Math.floor(timer.seconds / 60)).padStart(2,"0")}:{String(timer.seconds % 60).padStart(2,"0")}
          </span>
          <button onClick={timer.stop} style={{
            background: "#1a1714", border: "1px solid #2a2a2a", borderRadius: "8px",
            color: "#555", fontSize: "12px", fontWeight: 700,
            padding: "10px 18px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em",
          }}>SKIP</button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ padding: "28px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
          <span style={{ color: "#242424", fontSize: "11px", letterSpacing: "0.12em", fontWeight: 700 }}>ELI · WEEK 6+</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "#242424", fontSize: "11px" }}>{dateStr}</span>
            <button onClick={() => setShowExport(true)} style={{
              background: "#1a1714", border: "1px solid #1e1e1e", borderRadius: "6px",
              color: "#444", fontSize: "10px", padding: "4px 10px", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", fontWeight: 700,
            }}>EXPORT</button>
          </div>
        </div>
        <div style={{ color: "#2a2a2a", fontSize: "12px", letterSpacing: "0.08em", marginBottom: "2px" }}>TODAY</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "32px", fontWeight: 700, lineHeight: 1, color: isRestDay ? "#2a2a2a" : accent, marginBottom: "5px" }}>
          {isRestDay ? "REST DAY" : day.title}
        </div>
        <div style={{ color: "#2a2a2a", fontSize: "11px", letterSpacing: "0.06em" }}>
          {isRestDay ? "RECOVER · EAT · SLEEP" : day.subtitle.toUpperCase()}
        </div>
      </div>

      {/* ── NOTIFICATION PROMPT ── */}
      {notifStatus === "default" && !isRestDay && !day?.isPool && (
        <div style={{ margin: "16px 20px 0", background: "#0f0f0a", border: "1px solid #2a2a10", borderRadius: "12px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#B85C38", fontSize: "12px", fontWeight: 700 }}>Enable Notifications</div>
            <div style={{ color: "#3a3a2a", fontSize: "11px", marginTop: "2px" }}>Rest timer + next exercise alerts</div>
          </div>
          <button onClick={handleNotifRequest} style={{
            background: "#B85C38", border: "none", borderRadius: "8px",
            color: "#0e0c0b", fontSize: "11px", fontWeight: 700,
            padding: "7px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            letterSpacing: "0.06em", flexShrink: 0,
          }}>ALLOW</button>
        </div>
      )}

      {/* ── DAY STRIP ── */}
      <div style={{ display: "flex", gap: "5px", padding: "16px 20px 0", overflowX: "auto", scrollbarWidth: "none" }}>
        {WEEK.map(w => {
          const isActive = w.dayIndex === activeDow;
          const isTodayDot = w.dayIndex === todayDow;
          const pIdx = DAY_MAP[w.dayIndex];
          const dayAccent = pIdx !== null ? PROGRAM_DAYS[pIdx].color : "#333";
          return (
            <button key={w.dayIndex} onClick={() => { setActiveDow(w.dayIndex); setActiveExIdx(0); }} style={{
              flexShrink: 0, padding: "9px 10px",
              background: isActive ? `${dayAccent}15` : "#0f0f0f",
              border: `1px solid ${isActive ? dayAccent + "70" : "#181818"}`,
              borderRadius: "10px", cursor: "pointer",
              color: isActive ? dayAccent : "#2a2a2a",
              fontSize: "11px", fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center", minWidth: "42px", letterSpacing: "0.04em",
            }}>
              <div>{w.short}</div>
              <div style={{ marginTop: "5px", height: "4px", display: "flex", justifyContent: "center" }}>
                {isTodayDot && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: isActive ? dayAccent : "#2a2a2a" }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── PROGRESS BAR ── */}
      {!isRestDay && !day?.isPool && totalSets > 0 && (
        <div style={{ padding: "14px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#242424", fontSize: "11px", letterSpacing: "0.08em", fontWeight: 700 }}>SETS COMPLETED</span>
            <span style={{ color: doneSets === totalSets ? "#7EB8D4" : "#242424", fontSize: "11px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
              {doneSets} / {totalSets}
            </span>
          </div>
          <div style={{ background: "#1a1714", borderRadius: "3px", height: "2px" }}>
            <div style={{ height: "100%", borderRadius: "3px", background: doneSets === totalSets ? "#7EB8D4" : accent, width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%`, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}



      {/* ── CONTENT ── */}
      <div style={{ padding: "14px 20px 0" }}>
        {isRestDay ? <RestDayView /> : day.isPool ? (
          <>
            <PoolDay
              day={day}
              todayChecked={todayCoreChecked}
              onToggle={handleCoreToggle}
              freq={coreFreq}
            />
            {day.pm && (
              <PMSection
                stretches={day.pm}
                nextDayTitle={DAY_MAP[(activeDow + 1) % 7] !== null ? PROGRAM_DAYS[DAY_MAP[(activeDow + 1) % 7]]?.title : null}
              />
            )}
          </>
        ) : (
          <>
            {day.warmup.length > 0 && (
              <WarmupSection items={day.warmup} accent={accent} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {day.exercises.map((ex, exIdx) => (
                <ExerciseCard
                  key={exIdx} ex={ex} exIdx={exIdx} accent={accent}
                  logs={getExLogs(exIdx)}
                  lastSessionLogs={getLastSessionExLogs(exIdx)}
                  isCurrent={exIdx === activeExIdx}
                  isNext={exIdx === activeExIdx + 1}
                  onLogSet={handleLogSet}
                  onStartTimer={() => handleStartTimer(exIdx)}
                />
              ))}
            </div>
            {doneSets === totalSets && totalSets > 0 && (
              <div style={{ marginTop: "20px", padding: "24px", background: "#0f1520", border: "1px solid #1a2a3a", borderRadius: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>💪</div>
                <div style={{ color: "#7EB8D4", fontWeight: 700, fontSize: "14px", fontFamily: "'Space Mono', monospace", letterSpacing: "0.06em" }}>WORKOUT COMPLETE</div>
                <div style={{ color: "#2a3a4a", fontSize: "12px", marginTop: "5px" }}>{totalSets} sets logged · Hit your protein</div>
                <button onClick={() => setShowExport(true)} style={{
                  marginTop: "14px", background: "none", border: "1px solid #1a2a3a",
                  borderRadius: "8px", color: "#2a4a5a", fontSize: "11px",
                  padding: "8px 16px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700, letterSpacing: "0.08em",
                }}>EXPORT FOR CLAUDE ANALYSIS →</button>
              </div>
            )}
            {day.pm && (
              <PMSection
                stretches={day.pm}
                nextDayTitle={DAY_MAP[(activeDow + 1) % 7] !== null ? PROGRAM_DAYS[DAY_MAP[(activeDow + 1) % 7]]?.title : null}
              />
            )}
          </>
        )}
      </div>

      {/* ── MODALS ── */}
      {showExport && <ExportModal allLogs={allLogs} coreLogs={coreLogs} onClose={() => setShowExport(false)} />}
    </div>
  );
}
