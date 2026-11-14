import { openUrl } from 'nsh';
import { checkForUpdate, downloadUpdate, installAndRestart, shellInfo } from 'nsh/updater';
import { DesktopUpdateReceipt } from 'hongguo-desktop/native';
import type { AppUpdate, UpdateAdapter } from '@hongguo/app';

const release = 'https://github.com/bijinfeng/hongguo-tv/releases/latest';
/** NSH retains the last checked target globally; only the root controller may call it. */
export function desktopUpdates(): UpdateAdapter {
  let candidate: AppUpdate | null = null;
  return {
    async initialize() {
      const info = shellInfo();
      return {
        version: info.version ?? '开发版本',
        supported: !!info.version,
        installed: info.version ? await DesktopUpdateReceipt.confirm(info.version) : false,
      };
    },
    async check() {
      candidate = await checkForUpdate();
      return candidate;
    },
    download: (progress) => downloadUpdate((value) => progress(value.received, value.total)),
    async install() {
      if (!candidate) throw new Error('请先检查并下载更新');
      await DesktopUpdateReceipt.expect(candidate.version);
      try {
        await installAndRestart();
      } catch (reason) {
        await DesktopUpdateReceipt.clear();
        throw reason;
      }
      return 'installing';
    },
    async openRelease() {
      if (!(await openUrl(release)).opened) throw new Error('无法打开下载页面');
    },
  };
}
