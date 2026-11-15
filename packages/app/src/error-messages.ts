/** User-facing recovery text. Keep the original error in the resource or catch-site diagnostics. */
const reasons: Record<string, string> = {
  CORE_NOT_IMPLEMENTED: '此功能尚未开放',
  SEARCH_PAGE_INVALID: '搜索分页数据无效，请重试',
  UPSTREAM_TIMEOUT: '内容服务连接超时，请重试',
  UPSTREAM_UNAVAILABLE: '内容服务连接失败，请稍后重试',
  UPSTREAM_HTTP_ERROR: '内容服务暂时不可用，请稍后重试',
  UPSTREAM_INVALID_DATA: '内容数据暂时无法读取，请稍后重试',
  SEARCH_VERIFICATION_REQUIRED: '内容来源需要验证，请稍后重试',
  UNSUPPORTED_CONTENT_TYPE: '此内容类型尚未开放',
  LIBRARY_OWNER_CHANGED: '记录所属账号已变化，请重新加载',
  LIBRARY_DATABASE_INVALID: '记录无法读取，请保留本机数据并检查版本或备份',
  SEARCH_HISTORY_DATABASE_INVALID: '搜索记录无法读取，请保留本机数据并检查版本或备份',
  LIBRARY_STORAGE_UNAVAILABLE: '记录暂时无法读写，请检查可用空间和访问权限后重试',
  SEARCH_HISTORY_STORAGE_UNAVAILABLE: '搜索记录暂时无法读写，请检查可用空间和访问权限后重试',
  ACCOUNT_FOLLOW_INCOMPLETE: '追更列表未完整读取，请刷新状态',
  ACCOUNT_FOLLOW_REJECTED: '追更服务未接受此次操作，请刷新后再试',
  ACCOUNT_FOLLOW_BUSY: '另一项追更操作尚未结束，请稍后刷新状态',
  ACCOUNT_FOLLOW_UNCERTAIN: '追更操作结果尚未确认，请刷新状态',
  ACCOUNT_FOLLOW_RESPONSE_INVALID: '追更响应无法确认，请刷新状态',
  ACCOUNT_RESERVATION_INCOMPLETE: '预约列表未完整读取，请刷新状态',
  ACCOUNT_RESERVATION_REJECTED: '预约服务未接受此次操作，请刷新后再试',
  ACCOUNT_RESERVATION_BUSY: '另一项预约操作尚未结束，请稍后刷新状态',
  ACCOUNT_RESERVATION_UNCERTAIN: '预约操作结果尚未确认，请刷新状态',
  ACCOUNT_RESERVATION_RESPONSE_INVALID: '预约响应无法确认，请刷新状态',
};

/** Maps stable error categories; arbitrary service messages never become product copy. */
export function errorMessage(error: unknown, operation: string): string {
  if (error === undefined || error === null || error === '') return '';
  const failure = error as { code?: unknown; status?: unknown; name?: unknown };
  if (failure.name === 'AbortError' || failure.code === 'ABORT_ERR') return '';
  const reason = typeof failure.code === 'string' ? reasons[failure.code] : undefined;
  if (reason) return `${operation}：${reason}`;
  if (failure.status === 401) return `${operation}：登录状态已失效，请重新登录`;
  if (failure.status === 403) return `${operation}：暂时没有访问权限`;
  if (failure.status === 429) return `${operation}：请求过于频繁，请稍后再试`;
  if (typeof failure.status === 'number' && failure.status >= 500)
    return `${operation}：服务暂时不可用，请稍后重试`;
  return `${operation}，请重试`;
}
