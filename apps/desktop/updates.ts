import { openUrl } from 'nsh';
import {
  checkForUpdate,
  downloadUpdate,
  installAndRestart,
  installOnQuit,
  shellInfo,
} from 'nsh/updater';
import { DesktopUpdateReceipt } from 'hongguo-desktop/native';
import type { AppUpdate, UpdateAdapter } from '@hongguo/app';

const release = 'https://github.com/bijinfeng/hongguo-tv/releases/latest';
/** NSH retains the last checked target globally; only the root controller may call it. */
export function desktopUpdates(): UpdateAdapter {
  let candidate: AppUpdate | null = null;
  let staged = false;
  return {
    async initialize() {
      const info = shellInfo();
      // Reading the receipt consumes it: the next start reports each outcome once.
      const receipt = info.version ? await DesktopUpdateReceipt.confirm(info.version) : 'none';
      return {
        version: info.version ?? '开发版本',
        supported: !!info.version,
        installed: receipt === 'updated',
        interrupted: receipt === 'interrupted',
      };
    },
    async check() {
      candidate = await checkForUpdate();
      return candidate;
    },
    download: (progress) => downloadUpdate((value) => progress(value.received, value.total)),
    async install() {
      if (!candidate) throw new Error('请先检查并下载更新');
      // NSH unpacks and checks the staged app now, so a bad package still fails here;
      // quitting then only swaps it in. The receipt is what confirms that swap happened.
      await DesktopUpdateReceipt.expect(candidate.version);
      try {
        await installOnQuit();
      } catch (reason) {
        await DesktopUpdateReceipt.clear();
        throw reason;
      }
      staged = true;
      return 'staged';
    },
    async restart() {
      if (!staged) throw new Error('更新尚未准备好，请重新下载');
      try {
        // The staged update is already promised; this installs it now instead of on quit.
        await installAndRestart();
      } catch {
        // An immediate install drops what waited on quit. The downloaded archive survives a
        // failed one, so stage it again rather than stranding a verified package.
        try {
          await installOnQuit();
        } catch {
          await DesktopUpdateReceipt.clear();
          staged = false;
          throw new Error('立即重启失败，请重新下载更新');
        }
        throw new Error('立即重启失败，更新仍会在退出应用后完成');
      }
      return 'installing';
    },
    async openRelease() {
      if (!(await openUrl(release)).opened) throw new Error('无法打开下载页面');
    },
  };
}
