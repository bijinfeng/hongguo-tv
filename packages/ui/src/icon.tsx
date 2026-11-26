import { Icon as Glyph } from 'nsh-icon';
import { controlMetrics, type ControlSize } from './foundation';

/** The color tokens an icon may inherit; each names a `text-*` class. */
export type IconTone =
  | 'foreground'
  | 'muted-foreground'
  | 'accent-foreground'
  | 'primary-foreground'
  | 'primary-strong-foreground'
  | 'destructive'
  | 'background'
  | 'cinema-foreground'
  | 'cinema-muted';

/** A literal per token: NSH resolves classes by reading them from the bundle. */
const toneClass = {
  foreground: 'text-foreground',
  'muted-foreground': 'text-muted-foreground',
  'accent-foreground': 'text-accent-foreground',
  'primary-foreground': 'text-primary-foreground',
  'primary-strong-foreground': 'text-primary-strong-foreground',
  destructive: 'text-destructive',
  background: 'text-background',
  'cinema-foreground': 'text-cinema-foreground',
  'cinema-muted': 'text-cinema-muted',
} as const;

/** Decorative glyph; the containing control supplies its accessible name. */
export interface IconProps {
  /**
   * An icon constant imported from `nsh-icon-lucide` (`Search`, `ChevronDown`), or
   * any SVG `data:` URI drawn with `currentColor`. Passing the constant rather than
   * a name is what keeps the bundle to the icons the code imports.
   */
  icon: string;
  size?: ControlSize;
  /** Internal semantic color adapter; pages use the containing control's variant. */
  tone?: IconTone;
}

/** Official Lucide geometry, drawn in the inherited text color. */
export function Icon(props: IconProps) {
  return (
    <Glyph
      icon={props.icon}
      size={controlMetrics(props.size).iconSize}
      class={toneClass[props.tone ?? 'foreground']}
    />
  );
}
