import { Canvas, Path2D, token } from 'nsh';
import { controlMetrics, type ControlSize } from './foundation';
import { iconNodes, type LucideName } from './icons.generated';

const aliases = {
  home: 'house',
  close: 'x',
  back: 'chevron-left',
  forward: 'chevron-right',
  down: 'chevron-down',
  next: 'skip-forward',
  volume: 'volume-2',
  mute: 'volume-x',
  fullscreen: 'maximize',
} as const;
/** Official Lucide names plus stable semantic aliases used by existing pages. */
export type IconName = LucideName | keyof typeof aliases;
/** Decorative glyph; the containing control supplies its accessible name. */
export interface IconProps {
  name: IconName;
  size?: ControlSize;
  /** Internal semantic color adapter; pages use the containing control's variant. */
  color?: string;
}
/** Original official SVG geometry, rendered at stroke 2 on the native canvas. */
export function Icon(props: IconProps) {
  return (
    <Canvas
      accessibilityElementsHidden
      style={{
        width: controlMetrics(props.size).iconSize,
        height: controlMetrics(props.size).iconSize,
      }}
      draw={(cx, size) => {
        cx.scale(size.width / 24, size.height / 24);
        cx.strokeStyle = props.color ?? token('foreground');
        cx.lineWidth = 2;
        cx.lineCap = 'round';
        cx.lineJoin = 'round';
        const name =
          props.name in aliases ? aliases[props.name as keyof typeof aliases] : props.name;
        for (const [kind, a] of iconNodes[name]) {
          cx.beginPath();
          const n = (key: string) => Number(a[key] ?? 0);
          if (kind === 'path') cx.stroke(new Path2D(a.d));
          else {
            if (kind === 'circle') cx.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
            else if (kind === 'ellipse')
              cx.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
            else if (kind === 'rect')
              cx.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx'));
            else if (kind === 'line') {
              cx.moveTo(n('x1'), n('y1'));
              cx.lineTo(n('x2'), n('y2'));
            } else if (kind === 'polyline' || kind === 'polygon') {
              const points = a.points.trim().split(/[ ,]+/).map(Number);
              cx.moveTo(points[0], points[1]);
              for (let i = 2; i < points.length; i += 2) cx.lineTo(points[i], points[i + 1]);
              if (kind === 'polygon') cx.closePath();
            }
            cx.stroke();
          }
        }
      }}
    />
  );
}
