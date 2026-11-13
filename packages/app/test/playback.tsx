import { expect, test } from 'nsh/test';
import { progressSession } from '../src/playback';

export function registerPlaybackTests() {
  test('progress saves only played content and completion survives cleanup', () => {
    const writes: { position: number; completed: boolean }[] = [];
    const session = progressSession((position, _, completed) =>
      writes.push({ position, completed }),
    );
    session.save();
    session.update(0, 60, true);
    session.save();
    expect(writes.length).toBe(0);
    session.update(15, 60, true);
    session.update(20, 60, true);
    session.save();
    expect(writes.length).toBe(2);
    session.end();
    session.save();
    expect(writes.length).toBe(3);
    expect(writes[2].completed).toBe(true);
  });
}
