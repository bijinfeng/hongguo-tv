/** One stable, selectable option. Values are identifiers; labels are presentation. */
export interface ChoiceOption {
  /** Stable identifier used as the controlled value. */
  value: string;
  /** Human-readable title, allowed to wrap. */
  label: string;
  /** Unavailable options remain visible and are skipped by keyboard navigation. */
  disabled?: boolean;
}
