import { supportAt, STEP_UP } from './collision.js';

// Vertical movement: jumping, gravity, landing on furniture, trampoline bounces.

export const GRAVITY = 15; // m/s^2 (a bit floaty, kid-game style)
export const JUMP_SPEED = 5.6; // -> about 1.05 m high, enough to get onto a counter
const TRAMPOLINE_JUMP = 9.5; // jumping on the trampoline goes much higher
const TRAMPOLINE_MIN_BOUNCE = 4.5; // keeps bouncing by itself

/**
 * Advance the player's height by dt. `takeJump()` returns true (once) if jump
 * was pressed. Returns the height of the surface under the player.
 */
export function stepVertical(player, boxes, dt, takeJump) {
  if (player.grounded && takeJump()) {
    player.vy = JUMP_SPEED;
    player.grounded = false;
  } else if (player.support?.bouncy && takeJump()) {
    player.boost = true; // pressed mid-bounce: next trampoline bounce goes high
  }

  const prevY = player.y;
  const wasGrounded = player.grounded;
  player.vy -= GRAVITY * dt;
  player.y += player.vy * dt;

  const below = supportAt(boxes, player.x, player.z, prevY + STEP_UP);
  // Walking down a slope or off a tiny ledge: stay on the ground instead of hopping
  if (wasGrounded && player.vy <= 0 && below.height < player.y && prevY - below.height < 0.12) player.y = below.height;
  if (player.y <= below.height) {
    const impact = -player.vy;
    player.y = below.height;
    player.support = below.box;
    if (below.box?.bouncy && impact > 1) {
      // Trampoline: bounce back up, much higher if jump was pressed
      player.vy = player.boost ? TRAMPOLINE_JUMP : Math.max(TRAMPOLINE_MIN_BOUNCE, impact * 0.85);
      player.grounded = false;
    } else {
      player.vy = 0;
      player.grounded = true;
    }
    player.boost = false;
  } else {
    player.grounded = false;
  }
  return below.height;
}
