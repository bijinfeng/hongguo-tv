import { expect, open, test } from 'nsh/test';

/** Explicit graphical-host matrix. It proves controls, never decoding or viewing history. */
export function registerPlayerControlsHost(
  entry: string,
  artifacts: string,
  target: 'web' | 'macos' | 'android',
) {
  for (const reducedMotion of [false, true]) {
    test(`cinema controls: ${target === 'android' ? 'touch' : 'keyboard'}, light/dark, overlays (reduced motion: ${reducedMotion})`, async () => {
      const app = await open(entry, {
        ...(target === 'android' ? {} : { width: 1180, height: 780 }),
        colorScheme: 'light',
        reducedMotion,
        network: {},
      });
      const key = (value: string) => app.keyboard.press(value);
      const tabs = async (count: number) => {
        for (let i = 0; i < count; i++) await key('tab');
      };
      const suffix = reducedMotion ? '-reduced-motion' : '';
      await app.waitFor('播放器控件预览');
      await app.wait(300);
      if (target === 'android') {
        await app.press('播放');
        await app.waitFor('25 / 102');
        await app.drag('播放进度', { x: 120 });
        const position = Number(
          app
            .texts()
            .find((value) => value.endsWith(' / 102'))
            ?.split(' / ')[0],
        );
        expect(position > 25 && position <= 102).toBe(true);
        await app.waitFor(`提交 ${position} · 音量 80 · 速度 1`);
        await app.press('静音');
        await app.drag('音量', { x: 20 });
        expect(app.texts().some((value) => /^提交 \d+ · 音量 [1-9]\d* · 速度 1$/.test(value))).toBe(
          true,
        );
        await app.screenshot(`${artifacts}/slider-touch-light${suffix}.png`);
        await app.press('播放速度');
        await app.waitFor('1.5×');
        await app.screenshot(`${artifacts}/select-light${suffix}.png`);
        await app.setColorScheme('dark');
        await app.screenshot(`${artifacts}/select-dark${suffix}.png`);
        // The Android picker removes its row on touch-down, before the test's touch-up resolves.
        await app.press('1.5×').catch((error: unknown) => {
          if (
            !String(error).includes('has no native view') ||
            !app.texts().some((value) => value.endsWith(' · 速度 1.5'))
          )
            throw error;
        });
        expect(app.texts().some((value) => value.endsWith(' · 速度 1.5'))).toBe(true);
        await app.press('选集');
        await app.waitFor('第 1 集');
        expect(app.enabled('第 2 集 · 未开放')).toBe(false);
        await app.screenshot(`${artifacts}/panel-dark${suffix}.png`);
        await app.keyboard.press('escape');
        await app.press('控件预览');
        await app.wait(250);
        expect(app.shows('播放')).toBe(false);
        await app.press('预览结束 0');
        await app.waitFor('预览结束 1');
        await app.press('控件预览');
        await app.waitFor(`${position} / 102`);
        await app.screenshot(`${artifacts}/controls-dark${suffix}.png`);
        await app.setColorScheme('light');
        await app.screenshot(`${artifacts}/controls-light${suffix}.png`);
        return;
      }
      await tabs(3);
      await key('enter');
      await app.waitFor('25 / 102');
      expect(app.enabled('下一集')).toBe(false);
      await key('shift+tab');
      await key('right');
      await app.waitFor('26 / 102');
      await app.waitFor('提交 26 · 音量 80 · 速度 1');
      await app.screenshot(`${artifacts}/slider-focus-light${suffix}.png`);
      await tabs(2);
      await key('enter');
      await app.waitFor('提交 26 · 音量 0 · 速度 1');
      await tabs(1);
      await key('right');
      await app.waitFor('提交 26 · 音量 5 · 速度 1');
      await tabs(1);
      await key('enter');
      await app.waitFor('1.5×');
      await app.screenshot(`${artifacts}/select-light${suffix}.png`);
      await key('end');
      await key('enter');
      await app.waitFor('提交 26 · 音量 5 · 速度 1.5');
      await key('enter');
      await key('home');
      await key('enter');
      await app.waitFor('提交 26 · 音量 5 · 速度 1');
      await key('enter');
      await key('end');
      await key('space');
      await app.waitFor('提交 26 · 音量 5 · 速度 1.5');
      // Leaving an open Select moves past the trigger, in either direction.
      await key('enter');
      await key('tab');
      await key('enter');
      await app.waitFor('第 1 集');
      await key('escape');
      await app.wait(300);
      await key('shift+tab');
      await key('enter');
      await key('shift+tab');
      await key('right');
      await app.waitFor('提交 26 · 音量 10 · 速度 1.5');
      await key('left');
      await key('tab');
      // The Select must restore its trigger, so Enter reopens it.
      await key('enter');
      await app.waitFor('1×');
      await app.setColorScheme('dark');
      await app.screenshot(`${artifacts}/select-dark${suffix}.png`);
      await key('escape');
      await key('shift+tab');
      await app.screenshot(`${artifacts}/slider-focus-dark${suffix}.png`);
      await tabs(2);
      await key('enter');
      await app.waitFor('第 1 集');
      expect(app.enabled('第 2 集 · 未开放')).toBe(false);
      await app.press('id:episode-range-trigger');
      await key('end');
      await key('enter');
      await app.waitFor('49–60 集');
      expect(app.shows('1–24 集')).toBe(false);
      await key('enter');
      await key('home');
      await key('space');
      await app.waitFor('1–24 集');
      expect(app.shows('49–60 集')).toBe(false);
      await app.screenshot(`${artifacts}/panel-dark${suffix}.png`);
      await key('escape');
      await app.wait(300);
      await key('enter');
      await app.waitFor('第 1 集');
      await key('escape');
      await app.wait(300);
      await app.screenshot(`${artifacts}/panel-return-focus${suffix}.png`);
      for (let i = 0; i < 6; i++) await key('shift+tab');
      await key('enter');
      await app.wait(250);
      expect(app.shows('播放')).toBe(false);
      // Tab skips every hidden control and reaches the fixture's trailing sentinel.
      await tabs(1);
      await app.screenshot(`${artifacts}/hidden-focus${suffix}.png`);
      await key('enter');
      await app.waitFor('预览结束 1');
      await key('shift+tab');
      await key('enter');
      await app.waitFor('26 / 102');
      await app.screenshot(`${artifacts}/controls-dark${suffix}.png`);
      await app.setColorScheme('light');
      await app.screenshot(`${artifacts}/controls-light${suffix}.png`);
    });
  }
}
