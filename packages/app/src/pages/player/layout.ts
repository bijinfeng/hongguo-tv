import { windowSize } from 'nsh';

/**
 * The desktop player reads as one dark band: the picture area, the transport band under it and
 * the title/actions line share one width, and the episode rail keeps its own fixed lane. The
 * picture grows with the window but leaves room for the transport, the caption inside the picture
 * and the action line, so 1180×780 and 1440×1000 both keep a whole first screen.
 */
export const PLAYER_RAIL_WIDTH = 316;
export const PLAYER_RAIL_GAP = 24;

/** Chrome around the picture: page padding, crumb, transport band and the action line. */
const CHROME = 428;
const MIN_PICTURE = 320;
const MAX_PICTURE = 660;
/** In full screen the picture leaves this much of the window to the transport band under it. */
const FULLSCREEN_CHROME = 96;

/** Picture height for the current window; the page composition owns this, not the stage. */
export function pictureHeight(): number {
  return Math.max(MIN_PICTURE, Math.min(MAX_PICTURE, windowSize().height - CHROME));
}

/** Picture height while the window is full screen: no crumb or action line above or below. */
export function fullScreenPictureHeight(): number {
  return Math.max(0, windowSize().height - FULLSCREEN_CHROME);
}

/**
 * The picture keeps a portrait ratio whole. Anything narrower than the stage is filled by the
 * blurred copy, so the picture itself takes the stage height at a 2:3 frame.
 */
export const PICTURE_RATIO = 2 / 3;
