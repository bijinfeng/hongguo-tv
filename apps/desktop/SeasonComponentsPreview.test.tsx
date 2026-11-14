import { registerSeasonChoiceTests } from '@hongguo/ui/testing/season-choice';
import { registerSeasonPickerTests } from '@hongguo/app/testing/season-picker';

registerSeasonChoiceTests('./SeasonChoicePreview.tsx', 'desktop');
registerSeasonPickerTests('./SeasonComponentsPreview.tsx', 'desktop');
