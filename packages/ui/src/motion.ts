import { createMotion } from 'nsh';
export const motionTokens = { fast: 100, base: 180, distance: 8 };
export function entrance() {
  return createMotion({
    enter: {
      keyframes: { opacity: [0, 1], translateY: [motionTokens.distance, 0] },
      duration: motionTokens.base,
      easing: 'easeOut',
    },
  });
}
