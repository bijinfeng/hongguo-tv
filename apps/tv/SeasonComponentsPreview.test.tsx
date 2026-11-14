import { registerSeasonChoiceTests } from '@hongguo/ui/testing/season-choice';
import { registerSeasonPickerTests } from '@hongguo/app/testing/season-picker';

registerSeasonChoiceTests('./SeasonChoicePreview.tsx', 'tv');
registerSeasonPickerTests('./SeasonComponentsPreview.tsx', 'tv');
