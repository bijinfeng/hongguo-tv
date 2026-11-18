import { View } from 'nsh';
import { Progress, UiText } from './display';
import { space } from './foundation';

/** Byte counts supplied by the updater; the component owns no download state. */
export interface DownloadProgressProps {
  received: number;
  total?: number;
}

/** Shares range and unknown-total motion with Progress; byte counts update in place. */
export function DownloadProgress(props: DownloadProgressProps) {
  return (
    <View style={{ gap: space('sm') }}>
      <Progress
        accessibilityLabel="更新下载进度"
        value={props.received}
        max={props.total}
        indeterminate={!props.total}
      />
      <UiText role="numeric" tone="muted">
        {`${(props.received / 1048576).toFixed(1)} MB${props.total ? ` / ${(props.total / 1048576).toFixed(1)} MB` : ''}`}
      </UiText>
    </View>
  );
}
