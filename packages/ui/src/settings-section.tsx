import { View, type JSX } from 'nsh';
import { Product, tvUnit } from './foundation';
import { UiText } from './display';

const unit = (value: number) => (Product() === 'tv' ? tvUnit(value) : value);

/** A settings section owns its title and the rhythm between the rows below it. */
export interface SettingsSectionProps {
  title: string;
  /** `divided` rows share hairlines; `card` rows stand apart. */
  variant?: 'divided' | 'card';
  children?: JSX.Element;
  testID?: string;
}

/** @description Groups setting rows under one heading without prescribing row content. */
export function SettingsSection(props: SettingsSectionProps) {
  const divided = () => props.variant !== 'card';
  return (
    <View testID={props.testID} style={{ gap: unit(14) }}>
      <UiText role="section">{props.title}</UiText>
      <View style={{ gap: divided() ? 0 : unit(10) }}>{props.children}</View>
    </View>
  );
}
