import { mount, Text, View } from 'nsh';
import { TitleBar, controlInset, TITLE_BAR_HEIGHT } from '@hongguo/app';

/**
 * Fixture for the title bar contract: the constant height and the insets the bar reports are
 * printed as text so a test can read them without a real window. Off a desktop host `titleBar()`
 * reports nothing, so both insets are 0 and the content keeps the full row.
 */
mount(() => (
  <View class="flex-1">
    <TitleBar>
      <View testID="titlebar-content">
        <Text testID="titlebar-brand">红果短剧</Text>
      </View>
    </TitleBar>
    <Text testID="titlebar-height">{String(TITLE_BAR_HEIGHT)}</Text>
    <Text testID="titlebar-inset-left">{String(controlInset('left'))}</Text>
    <Text testID="titlebar-inset-right">{String(controlInset('right'))}</Text>
  </View>
));
