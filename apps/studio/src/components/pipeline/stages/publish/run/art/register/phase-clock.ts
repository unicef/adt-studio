/**
 * The register artwork's three-piece structure, and why it is not one animation.
 *
 * `register` is nominally ~2s and genuinely unbounded — 700ms against a warm Worker, five seconds
 * against a cold one. A single fixed-length one-shot is therefore wrong in both directions: it
 * either gets cut off mid-gesture or it runs out and parks on a dead frame, which at the emotional
 * peak of the screen reads as a hang. So the motion is separately-triggered pieces:
 *
 * - `pre`        — the tail of step 3. The artwork's in-progress resting state.
 * - `anticipate` — the first 160ms of Opening, kept as its own beat so the boundary exists for any
 *                  future gesture that needs a distinct anticipation before travelling.
 * - `opening`    — the rest of Opening. One-shot, ~560–860ms.
 * - `holding`    — indefinite. Static, or a breathe of ≤2% amplitude. Survives a 5s step.
 * - `arrived`    — one-shot, ~520–760ms, and **allowed to interrupt `opening`** — a warm Worker
 *                  lands `done` mid-gesture, which is why Opening is built from transitions rather
 *                  than keyframes: a transition to the resting state is interruptible by
 *                  definition, a keyframe is not.
 *
 * The phase is derived from `stepStates[3]` and `run.status` by `useRegisterPhase`. The stylesheet
 * keys everything off `data-reg-phase`, which `RegisterFrame` owns.
 */
export type RegisterPhase = "pre" | "anticipate" | "opening" | "holding" | "arrived"
