/**
 * Writing animation — a cursor (▌) "writes" decorative trail characters,
 * pauses, then the trail fades from left. Loops with rotating trail patterns.
 *
 * Frames:
 *   ▌ → ·▌ → ·˚▌ → ... → ·˚✧·⋆⑅˚₊·✧˚·▌ → ·˚✧·⋆⑅˚₊·✧˚· (blink)
 *   → ˚✧·⋆⑅˚₊·✧˚· → ... → · → (pause) → loop with next trail
 */

const CURSOR = "\u258c"; // ▌ block cursor

const TRAILS = [
  [..."\u00b7\u02da\u2727\u00b7\u22c6\u2845\u02da\u2082\u00b7\u2727\u02da\u00b7"],  // ·˚✧·⋆⑅˚₊·✧˚·
  [..."\u22b9\u00b7\u2726\u22b9\u00b7\u2726\u22b9\u00b7\u2726\u00b7"],               // ⊹·✦⊹·✦⊹·✦·
  [..."\u02da\u2082\u00b7\u27e1\u00b7\u02da\u2082\u00b7\u27e1\u00b7"],               // ˚₊·⟡·˚₊·⟡·
];

function buildFrames(trail: string[]): string[] {
  const frames: string[] = [];

  // Write phase: cursor advances right, leaving trail
  for (let i = 0; i <= trail.length; i++) {
    frames.push(trail.slice(0, i).join("") + CURSOR);
  }

  // Pause: full trail, cursor blinks (2 frames on, 1 off, 1 on)
  const full = trail.join("");
  frames.push(full + CURSOR);
  frames.push(full);
  frames.push(full + CURSOR);

  // Fade phase: trail dissolves from left
  for (let i = 1; i <= trail.length; i++) {
    frames.push(trail.slice(i).join(""));
  }

  // Pause empty
  frames.push("");
  frames.push("");

  return frames;
}

// Pre-build all frame sets
const ALL_FRAMES = TRAILS.map(buildFrames);

export function createPenAnimation(): () => string {
  let trailIndex = 0;
  let frameIndex = 0;

  return () => {
    const frames = ALL_FRAMES[trailIndex % ALL_FRAMES.length]!;
    const frame = frames[frameIndex % frames.length]!;
    frameIndex++;

    // Switch trail pattern after completing a full cycle
    if (frameIndex >= frames.length) {
      frameIndex = 0;
      trailIndex++;
    }

    return frame;
  };
}

/** Total frame count for one full cycle (all trail patterns). */
export const PEN_FRAME_COUNT = ALL_FRAMES.reduce((sum, f) => sum + f.length, 0);
