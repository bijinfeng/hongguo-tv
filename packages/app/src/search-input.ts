// Ordinary queries reject the same C0/C1 controls as the Rust boundary.
// oxlint-disable-next-line no-control-regex
const controls = /[\u0000-\u001f\u007f-\u009f]/;

/** Match Rust's Unicode whitespace without silently stripping non-whitespace BOMs. */
export const trimSearchInput = (value: string) =>
  value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');

export function validateSearchInput(value: string) {
  if (controls.test(value)) return { query: '', error: '请移除搜索内容中的控制字符。' };
  const query = trimSearchInput(value.replace(/\p{White_Space}+/gu, ' '));
  if (!query) return { query: '', error: '' };
  if ([...query].length > 80 || query.length > 100)
    return { query: '', error: '搜索内容过长，请缩短后重试。' };
  return { query, error: '' };
}

export const suggestionInput = (value: string) => {
  const query = trimSearchInput(value);
  return !controls.test(query) && [...query].length <= 100 ? query : '';
};
