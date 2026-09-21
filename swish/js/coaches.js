// coaches.js — the coaching brain, written as ARCHETYPES.
// No real coach, athlete, brand, program or trademarked system is named anywhere
// in this file, by design: what is codified here is public shooting biomechanics
// (joint angles, entry angle, sequencing) plus five teaching temperaments that
// exist across the sport. Voice belongs to the archetype, never to a person.

export const PERSONAS = [
  {
    id: "shot_doctor",
    name: "The Shot Doctor",
    role: "Diagnostician",
    blurb: "Quiet and precise. One small change at a time.",
    style: "Quiet, precise, deferential. Lowers the stakes, never a full teardown, reads the follow-through like an X-ray, asks before changing anything.",
    lines: [
      "Mind if I give you one thing? Catch it at your lowest point and only go up.",
      "Hold that follow-through. That is the evidence. Let us read it.",
      "You will make it or miss it. Not a big deal. We are just simplifying.",
    ],
  },
  {
    id: "skills_trainer",
    name: "The Skills Trainer",
    role: "Transfer coach",
    blurb: "Demanding, transfer obsessed. Game shots at game speed.",
    style: "Demanding, detail obsessed, transfer focused. Names every rep after a game action. Coaches the how and the why. No mindless reps.",
    lines: [
      "Game shots from game spots at game speed. That is the only scoreboard.",
      "Wrist wrinkled under the ball, up and over. Most of your misses are short.",
      "Do not circle it. Catch, lift, shoot. Gym results are not game results.",
    ],
  },
  {
    id: "hype",
    name: "The Hype",
    role: "Belief coach",
    blurb: "High energy, belief driven. Mechanics as identity.",
    style: "High energy, identity driven, almost preacher like. Lives on volume and belief. Feels what you feel and wants you to win that badly.",
    lines: [
      "Stay locked in. That next one is already going down.",
      "You did not fail, you understood it. Now you understand it. Run it back.",
      "Footwork, release, balance, reps. We rep it until it is automatic.",
    ],
  },
  {
    id: "the_professor",
    name: "The Professor",
    role: "Physics and rhythm",
    blurb: "Cerebral. The shot is a throw with a beat.",
    style: "Cerebral, rhythm and physics oriented, gently unconventional. Treats the shot as a throw and a dance. Calm, curious, evidence driven, never dogmatic.",
    lines: [
      "You are not shooting, you are throwing. Elbow on the goal, and throw it up.",
      "Good shooters miss long and short, never left or right. Your line is the math, your arc is the music.",
      "The destination is always the same, dropping in from above. The path is yours.",
    ],
  },
  {
    id: "fundamentalist",
    name: "The Fundamentalist",
    role: "Checklist and accountability",
    blurb: "Classic checklist plus earned confidence.",
    style: "Classic, checklist driven, accountability first. Coaches a clean routine and a repeatable base. Patient through misses. Confidence is the residue of reps.",
    lines: [
      "Balance, eyes, elbow, follow-through. Down and up, hold it until it drops.",
      "You have license to shoot any shot you want, and you will work for it.",
      "Confidence is not something I hand you. It is the residue of the reps.",
    ],
  },
];

// Teaching cues mapped to Swish's measured mechanics, voiced by archetype.
// Each entry is written for this app; none is a quotation of any person.
export const METRIC_CUES = {
  kneeLoad: [
    { from: "fundamentalist", cue: "Down and up. Start with the knees flexed, then extend legs and arm as one motion." },
    { from: "the_professor", cue: "Push the floor away. The power is a leg event, the arm just steers it." },
    { from: "skills_trainer", cue: "Off the catch, keep the bend short and quick so the release stays on time." },
  ],
  elbowSet: [
    { from: "the_professor", cue: "Put the elbow on the goal. It is an aiming device, not a hinge to overthink." },
    { from: "shot_doctor", cue: "Elbow and wrist snap in one straight line. That is what makes shots straight." },
    { from: "fundamentalist", cue: "Keep the shooting elbow in, ball between ear and shoulder." },
  ],
  elbowFlare: [
    { from: "the_professor", cue: "Elbow in and you only throw it up. Elbow out and you have to throw it up and in." },
    { from: "shot_doctor", cue: "Get the middle of your hand under the middle of the ball. The elbow follows the hand." },
    { from: "fundamentalist", cue: "Elbow tucked so the whole arm lines up straight at the rim." },
  ],
  setHeight: [
    { from: "shot_doctor", cue: "Set point out in front, not behind your head. Over the head leaves the elbow nowhere to go." },
    { from: "skills_trainer", cue: "Same set point every single time. Above the forehead, arms extending." },
    { from: "hype", cue: "Let it go on the way up, not at the top. Quick is a skill too." },
  ],
  releaseArc: [
    { from: "the_professor", cue: "Aim for the ball dropping into the rim from above, striking deep and dead center." },
    { from: "skills_trainer", cue: "Up and over. Most misses are short, so shoot it over the front rim, never flat." },
    { from: "shot_doctor", cue: "Rein a sky-high arc back in. Too much arc multiplies your depth error." },
  ],
  followThru: [
    { from: "shot_doctor", cue: "The follow-through is the evidence trail of the shot. Leave some evidence." },
    { from: "fundamentalist", cue: "Index finger straight at the target. Hold it until the ball reaches the rim." },
    { from: "skills_trainer", cue: "Finish with the pointer at the rim and the elbow at eyebrow level." },
  ],
  balance: [
    { from: "shot_doctor", cue: "Balance is not a posture, it is control of energy. Get level and square before you rise." },
    { from: "skills_trainer", cue: "Core engaged, hips quiet. Shoulders stay square even when your feet are not." },
    { from: "hype", cue: "Steady base, steady stroke. Everything follows balance." },
  ],
  base: [
    { from: "fundamentalist", cue: "Feet about shoulder width, toes straight, shooting-side foot slightly forward." },
    { from: "shot_doctor", cue: "Equal feet for an even push. A stagger can cost you your line." },
    { from: "skills_trainer", cue: "Wide enough on takeoff that a bump cannot push you off the straight line." },
  ],
  drift: [
    { from: "shot_doctor", cue: "Land where you left. Lean off line and the body fights itself." },
    { from: "the_professor", cue: "Barely jump. Go straight up a few inches so you land balanced and your legs stay fresh." },
    { from: "skills_trainer", cue: "Shoulders over knees on the landing. Upright, never leaning back." },
  ],
  guideHand: [
    { from: "shot_doctor", cue: "Fix the shooting hand first. A guide-hand push is usually a symptom, not the cause." },
    { from: "the_professor", cue: "The off hand supports the ball until it is ready, then it gets out of the way." },
    { from: "fundamentalist", cue: "Take the balance-hand thumb off for a few reps to expose a second-hand push." },
  ],
  rhythm: [
    { from: "skills_trainer", cue: "Catch, lift, shoot. Do not circle it. One continuous motion, feet to follow-through." },
    { from: "the_professor", cue: "Find the beat. Shooting is rhythmic, and every move prepares the next one." },
    { from: "hype", cue: "Same tempo every rep. Rhythm is what survives pressure." },
  ],
};

// What nearly every school of shooting agrees on. Non-negotiables, not opinions.
export const PRINCIPLES = [
  "One clean line to the rim. Elbow and wrist under and behind the ball so the push goes straight.",
  "Most misses are SHORT. Get the ball up and over, dropping down into the rim.",
  "Power comes from the legs in one synced down-and-up, not from the arm.",
  "The whole shot is one fluid, repeatable motion. The simpler the shot, the more consistent it is.",
  "The guide hand only supports the ball, then leaves clean. It never steers the flight.",
  "Hold the follow-through and read it. Finish tall, index finger at the target.",
  "Eyes lock on one target early and stay still. Do not watch the ball.",
  "Confidence is manufactured by reps and earned freedom. It matters as much as mechanics.",
];

// Where good coaches genuinely DISAGREE, so Swish never dogmatically picks one.
export const DEBATES = [
  "One motion versus two: releasing on the way up buys speed, a clearer load-then-lift buys power. Swish reads your natural pattern instead of forcing one.",
  "How much dip: a deeper dip builds rhythm and power, a shallow one buys a quicker release.",
  "Set-point height: out in front for control, above the head for speed.",
  "Arc: coach the entry into the rim and the feel, never a release angle in degrees.",
];

// What the brain is built on, stated without borrowing anyone's name or program.
export const LINEAGE =
  "Built on public shooting biomechanics and the teaching traditions behind them: " +
  "joint-angle research, entry-angle and depth studies of tracked shots, motor-learning work on " +
  "external cues, and the diagnostic, transfer, belief, physics and checklist schools of coaching. " +
  "The archetypes are composites. No coach, athlete or program is quoted or represented here.";

export function getPersona(id) { return PERSONAS.find(p => p.id === id) || PERSONAS[0]; }

// Best cue for a metric, preferring the selected archetype's own voice.
export function coachCue(metricKey, personaId) {
  const list = METRIC_CUES[metricKey] || [];
  if (!list.length) return null;
  const p = getPersona(personaId);
  const pick = list.find(c => c.from === p.id) || list[0];
  return { from: getPersona(pick.from).name, cue: pick.cue };
}
