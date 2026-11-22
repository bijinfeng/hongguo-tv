import type { AppUpdate, Updates, UpdatePhase } from './updates';

/**
 * One copy source for the update phases; the dialog, the settings row and the fixtures render
 * the same words instead of keeping per-surface state machines.
 */
export const updateTitles: Record<UpdatePhase, string> = {
  initializing: '正在打开更新服务',
  idle: '检查应用更新',
  checking: '正在检查更新',
  latest: '已是最新版本',
  available: '发现新版本',
  manual: '前往下载更新',
  downloading: '正在下载更新',
  cancelling: '正在取消下载',
  ready: '更新已准备好',
  saving: '正在保存观看进度',
  staging: '正在准备安装',
  staged: '退出应用后完成更新',
  interrupted: '上次更新未完成',
  installing: '等待更新完成',
  permission: '需要允许安装应用',
  success: '应用已更新',
  checkError: '无法检查更新',
  downloadError: '更新下载失败',
  saveError: '观看进度未能保存',
  installError: '安装未完成',
};

/** Settings-row copy for the value column: the same facts in the row's phrasing. */
export function updateStatusCopy(state: Updates): string {
  const phase = state.phase();
  if (phase === 'initializing') return '正在打开更新服务';
  if (phase === 'checking') return '正在检查更新';
  if (phase === 'latest') return '已是最新版本';
  if (phase === 'available') {
    const version = state.update()?.version;
    return version ? `有新版本 ${version}` : '有新版本可用';
  }
  if (phase === 'downloading') return '正在下载更新';
  if (phase === 'cancelling') return '正在取消下载';
  if (phase === 'ready') return '更新已下载，可以安装';
  if (phase === 'saving' || phase === 'staging') return '正在准备安装';
  if (phase === 'staged') return '退出应用后完成更新';
  if (phase === 'installing') return '正在安装更新';
  if (phase === 'interrupted') return '上次更新未完成';
  if (phase === 'success') return '应用已更新';
  if (phase === 'checkError') return '无法检查更新';
  if (phase === 'downloadError') return '更新下载失败';
  if (phase === 'installError') return '更新安装失败';
  if (phase === 'permission') return '需要安装权限';
  if (phase === 'manual') return '请前往发布页面下载';
  return '尚未检查更新';
}

/** Phases where an operation is in flight and the primary action is unavailable. */
export const UPDATE_BUSY_PHASES: readonly UpdatePhase[] = [
  'initializing',
  'checking',
  'downloading',
  'cancelling',
  'saving',
  'staging',
  'installing',
];
export function isUpdateBusy(phase: UpdatePhase): boolean {
  return UPDATE_BUSY_PHASES.includes(phase);
}

export function updateSizeText(size: number): string {
  return `${(size / 1048576).toFixed(1)} MB`;
}

/** The checked candidate line: 新版本 x.y.z · size. */
export function updateCandidateLine(update: AppUpdate | undefined): string {
  if (!update) return '';
  return `新版本 ${update.version}${update.size ? ` · ${updateSizeText(update.size)}` : ''}`;
}

export interface UpdatePrimaryAction {
  label: string;
  /** Quiet checks read as row actions; install and download carry the primary treatment. */
  variant: 'primary' | 'quiet';
  run: (state: Updates) => void;
}

/**
 * The stable primary action for a phase; `undefined` means an operation owns the button and it
 * renders the phase title disabled instead.
 */
export function updatePrimaryAction(
  phase: UpdatePhase,
  tv: boolean,
): UpdatePrimaryAction | undefined {
  switch (phase) {
    case 'available':
    case 'downloadError':
      return { label: '下载更新', variant: 'primary', run: (state) => void state.download() };
    case 'ready':
    case 'installError':
    case 'saveError':
      return {
        label: tv ? '安装更新…' : '准备安装',
        variant: 'primary',
        run: (state) => void state.install(),
      };
    case 'staged':
      return { label: '立即重启更新', variant: 'primary', run: (state) => void state.restart() };
    case 'permission':
      return { label: '前往设置…', variant: 'primary', run: (state) => void state.permission() };
    case 'manual':
      return {
        label: '前往下载页面…',
        variant: 'primary',
        run: (state) => void state.openRelease(),
      };
    case 'success':
    case 'latest':
    case 'interrupted':
      return { label: '再次检查', variant: 'quiet', run: (state) => void state.check() };
    default:
      return isUpdateBusy(phase)
        ? undefined
        : { label: '检查更新', variant: 'quiet', run: (state) => void state.check() };
  }
}

/** Phases whose availability can interrupt the visitor; TV pops the dialog for these. */
export const UPDATE_PROMPT_PHASES: readonly UpdatePhase[] = ['available', 'ready'];
export function canPromptUpdate(phase: UpdatePhase): boolean {
  return UPDATE_PROMPT_PHASES.includes(phase);
}
