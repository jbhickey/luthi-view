/**
 * Convert G-code coordinates to Three.js coordinates.
 * G-code X -> Three X, G-code Z -> Three Y (up), G-code Y -> Three -Z (depth)
 */
export function gcodeToThree(x, y, z) {
  return { x, y: z, z: -y };
}

/**
 * Tokenize a single G-code line into word pairs.
 * E.g. "G1 X10.5 Y-2.3 F500" -> [['G',1], ['X',10.5], ['Y',-2.3], ['F',500]]
 */
function tokenizeLine(raw) {
  // Strip comments (parentheses and semicolons)
  let line = raw.replace(/\(.*?\)/g, '').split(';')[0].trim();
  if (!line || line.startsWith('%')) return [];

  const words = [];
  const re = /([A-Za-z])([+-]?\d*\.?\d+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    words.push([m[1].toUpperCase(), parseFloat(m[2])]);
  }
  return words;
}

export class GCodeParser {
  /**
   * Parse G-code text into a structured moves array.
   * @param {string} text - Raw G-code text
   * @returns {{ moves: Array, bounds: {min, max}, warnings: string[], metadata: Object }}
   */
  static parse(text) {
    const rawLines = text.split(/\r?\n/);

    const state = {
      x: 0, y: 0, z: 0,
      feedrate: 0,
      modalMotion: 'G0',
      absolute: true,   // G90
      metric: true,      // G21
    };

    const moves = [];
    const warnings = [];
    let cutCount = 0;
    let rapidCount = 0;
    let minFeed = Infinity;
    let maxFeed = 0;

    for (let lineNum = 0; lineNum < rawLines.length; lineNum++) {
      const wordPairs = tokenizeLine(rawLines[lineNum]);
      if (wordPairs.length === 0) continue;

      const words = {};
      for (const [letter, value] of wordPairs) {
        words[letter] = value;
      }

      // Handle G-code commands
      if ('G' in words) {
        const g = words.G;
        if (g === 0 || g === 1 || g === 2 || g === 3) {
          state.modalMotion = `G${g}`;
        } else if (g === 20) {
          state.metric = false;
        } else if (g === 21) {
          state.metric = true;
        } else if (g === 28) {
          state.x = 0; state.y = 0; state.z = 0;
          continue;
        } else if (g === 90) {
          state.absolute = true;
        } else if (g === 91) {
          state.absolute = false;
        } else if (g >= 81 && g <= 89) {
          warnings.push(`Skipping canned cycle G${g} on line ${lineNum + 1}`);
          continue;
        }
      }

      // Handle feedrate
      if ('F' in words) {
        state.feedrate = words.F;
      }

      // Calculate target position from X/Y/Z words
      const hasMotion = 'X' in words || 'Y' in words || 'Z' in words;
      if (!hasMotion) continue;

      const from = { x: state.x, y: state.y, z: state.z };

      let tx, ty, tz;
      if (state.absolute) {
        tx = 'X' in words ? words.X : state.x;
        ty = 'Y' in words ? words.Y : state.y;
        tz = 'Z' in words ? words.Z : state.z;
      } else {
        tx = state.x + ('X' in words ? words.X : 0);
        ty = state.y + ('Y' in words ? words.Y : 0);
        tz = state.z + ('Z' in words ? words.Z : 0);
      }

      // Convert to metric if in imperial mode
      const scale = state.metric ? 1 : 25.4;
      const toX = tx * scale;
      const toY = ty * scale;
      const toZ = tz * scale;
      const fromX = from.x * scale;
      const fromY = from.y * scale;
      const fromZ = from.z * scale;

      state.x = tx;
      state.y = ty;
      state.z = tz;

      const motion = state.modalMotion;
      const isRapid = motion === 'G0';
      const isArc = motion === 'G2' || motion === 'G3';

      if (isArc) {
        const i = ('I' in words ? words.I : 0) * scale;
        const j = ('J' in words ? words.J : 0) * scale;
        const clockwise = motion === 'G2';
        const segments = GCodeParser._interpolateArc(
          fromX, fromY, fromZ, toX, toY, toZ, i, j, clockwise
        );
        for (const seg of segments) {
          moves.push({
            type: 'cut',
            from: seg.from,
            to: seg.to,
            feedrate: state.feedrate * scale,
          });
          cutCount++;
          if (state.feedrate > 0) {
            minFeed = Math.min(minFeed, state.feedrate * scale);
            maxFeed = Math.max(maxFeed, state.feedrate * scale);
          }
        }
      } else {
        const move = {
          type: isRapid ? 'rapid' : 'cut',
          from: { x: fromX, y: fromY, z: fromZ },
          to: { x: toX, y: toY, z: toZ },
          feedrate: isRapid ? 0 : state.feedrate * scale,
        };
        moves.push(move);

        if (isRapid) {
          rapidCount++;
        } else {
          cutCount++;
          if (state.feedrate > 0) {
            minFeed = Math.min(minFeed, state.feedrate * scale);
            maxFeed = Math.max(maxFeed, state.feedrate * scale);
          }
        }
      }
    }

    // Compute bounds
    const bounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity },
    };
    for (const m of moves) {
      for (const p of [m.from, m.to]) {
        bounds.min.x = Math.min(bounds.min.x, p.x);
        bounds.min.y = Math.min(bounds.min.y, p.y);
        bounds.min.z = Math.min(bounds.min.z, p.z);
        bounds.max.x = Math.max(bounds.max.x, p.x);
        bounds.max.y = Math.max(bounds.max.y, p.y);
        bounds.max.z = Math.max(bounds.max.z, p.z);
      }
    }

    if (minFeed === Infinity) minFeed = 0;

    return {
      moves,
      bounds,
      warnings,
      metadata: {
        moveCount: moves.length,
        cutCount,
        rapidCount,
        feedRange: { min: minFeed, max: maxFeed },
      },
    };
  }

  /**
   * Interpolate a G2/G3 arc into line segments.
   */
  static _interpolateArc(x0, y0, z0, x1, y1, z1, i, j, clockwise) {
    const cx = x0 + i;
    const cy = y0 + j;
    const r = Math.sqrt(i * i + j * j);

    let startAngle = Math.atan2(y0 - cy, x0 - cx);
    let endAngle = Math.atan2(y1 - cy, x1 - cx);

    if (clockwise) {
      if (endAngle >= startAngle) endAngle -= 2 * Math.PI;
    } else {
      if (endAngle <= startAngle) endAngle += 2 * Math.PI;
    }

    const totalAngle = Math.abs(endAngle - startAngle);
    const numSegments = Math.max(8, Math.ceil(totalAngle / (Math.PI / 18)));
    const segments = [];

    for (let s = 0; s < numSegments; s++) {
      const t0 = s / numSegments;
      const t1 = (s + 1) / numSegments;

      const a0 = startAngle + (endAngle - startAngle) * t0;
      const a1 = startAngle + (endAngle - startAngle) * t1;

      const z_t0 = z0 + (z1 - z0) * t0;
      const z_t1 = z0 + (z1 - z0) * t1;

      segments.push({
        from: { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0), z: z_t0 },
        to: { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1), z: z_t1 },
      });
    }

    return segments;
  }
}
