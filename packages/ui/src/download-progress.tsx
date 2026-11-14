import { Text } from 'nsh';
import { Progress } from 'nsh/base';

/** Byte progress keeps its semantic range without a focusable control or tick animation. */
export function DownloadProgress(props: { received: number; total?: number }) {
  return (
    <Progress
      accessibilityLabel="更新下载进度"
      value={props.total ? Math.min(100, (props.received / props.total) * 100) : 0}
      indeterminate={!props.total}
      class="gap-3"
      trackClass="h-1 bg-muted overflow-hidden rounded-(--radius)"
      indicatorClass="h-full bg-primary"
    >
      <Text class="text-base text-muted-foreground tabular-nums">
        {`${(props.received / 1048576).toFixed(1)} MB${props.total ? ` / ${(props.total / 1048576).toFixed(1)} MB` : ''}`}
      </Text>
    </Progress>
  );
}
