import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, open as openFile, readFile, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as pause } from 'node:timers/promises';
import { ready, stop } from './dev.mjs';
import { stopLiveHost } from './live-host-cleanup.mjs';
import {
  child,
  executable,
  nshVersion,
  output,
  root,
  runtimeConfig,
  rustEnvironment,
} from './process.mjs';

// Opt-in only: genuine media progress and UI mutations against a disposable real SQLite database.
const target = process.argv[2];
if (
  process.platform !== 'darwin' ||
  !['macos', 'web'].includes(target) ||
  process.argv.slice(3).join(' ') !== '--anonymous-live'
)
  throw new Error(
    'Expected macos|web --anonymous-live on macOS; requires a real host, upstream and playable media',
  );

const artifacts = resolve(
  root,
  'artifacts/live-history',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await mkdir(artifacts, { recursive: true });
const runtime = resolve(root, 'apps/web/runtime.generated.json');
const previous = await readFile(runtime);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const term = '重生';
const evidence = {
  startedAt: new Date().toISOString(),
  entry: 'apps/web/App.tsx',
  host: target,
  network: 'live',
  term,
  syntheticResponses: false,
  directHistoryWrites: false,
  manualClock: false,
  apiReads: [],
  watchStatistics: [],
  playbackFailures: [],
  passed: false,
  sourceHead: output('git', ['rev-parse', 'HEAD']),
  runtimeBeforeSha256: hash(previous),
  scope:
    target === 'macos'
      ? 'Production Web entry on a visible macOS NSH host through real Rust HTTP API; not Desktop native, browser Web or TV acceptance'
      : 'Production Web entry in Chromium with exact origin policy and live browser HTTP/media; not Desktop native, TV or packaged deployment acceptance',
};
let authorizeBrowser;
let api,
  host,
  build,
  runError,
  themeDeadline,
  interrupted = false;
let stoppingHost;
const hostCleanupErrors = [];
const ensureActive = () => {
  if (interrupted) throw new Error('Live history acceptance interrupted');
  if (themeDeadline !== undefined && Date.now() >= themeDeadline)
    throw new Error('Theme exceeded 300 seconds');
};
const stopHost = async () => {
  if (stoppingHost) return stoppingHost;
  const ownedHost = host;
  if (!ownedHost) return;
  stoppingHost = (async () => {
    const errors = await stopLiveHost(ownedHost, target === 'web');
    if (errors.length) {
      hostCleanupErrors.push(...errors);
      throw new Error(errors.join('; '));
    }
    if (host === ownedHost) host = undefined;
  })();
  try {
    await stoppingHost;
  } finally {
    stoppingHost = undefined;
  }
};
const onSignal = () => {
  interrupted = true;
  void stopHost()
    .then(() => stop(api))
    .then(() => stop(build))
    .catch(() => {});
};
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);

async function manifest(name) {
  const files = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    cwd: root,
  })
    .toString()
    .split('\0')
    .filter(Boolean)
    .filter(
      (path) =>
        !/^(?:upstream|artifacts|target|\.local)\//.test(path) &&
        !path.includes('/.nsh/') &&
        !path.endsWith('/runtime.generated.json'),
    )
    .sort();
  const entries = [];
  for (const path of new Set(files)) {
    try {
      entries.push({ path, sha256: hash(await readFile(resolve(root, path))) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const result = {
    head: output('git', ['rev-parse', 'HEAD']),
    status: output('git', ['status', '--porcelain']),
    entries,
  };
  await writeFile(resolve(artifacts, name + '.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
async function get(origin, path, name) {
  ensureActive();
  const remaining = themeDeadline === undefined ? 35000 : themeDeadline - Date.now();
  if (remaining <= 0) throw new Error('Theme exceeded 300 seconds');
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(Math.min(35000, remaining)),
  });
  const json = await response.json();
  evidence.apiReads.push({ path, name, status: response.status, at: new Date().toISOString() });
  await writeFile(resolve(artifacts, name + '.json'), JSON.stringify(json, null, 2) + '\n');
  if (!response.ok || !json.ok) throw new Error(`Real ${path}: HTTP ${response.status}`);
  return json.data;
}
const localDay = (value = Date.now()) => {
  const date = new Date(value);
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};
const watchStatistics = async (origin, account, name) => {
  const day = localDay();
  const params = new URLSearchParams({
    owner_id: account.owner_id ?? '',
    owner_epoch: account.owner_epoch,
    day,
  });
  return get(origin, `/api/v1/watch-statistics?${params}`, name);
};
const statisticsDuration = (snapshot) =>
  snapshot.days.reduce((total, day) => total + day.duration_ms, 0);
async function runHost(file, colorScheme, deadline) {
  ensureActive();
  const handshake = resolve(artifacts, file + '-browser');
  const nonce = randomUUID();
  const handshakeDeadline = Math.min(deadline, Date.now() + 20000);
  const browser =
    process.env.HONGGUO_LIVE_BROWSER ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  host = child(
    executable('nsh'),
    [
      'test',
      '.nsh/' + file,
      '--target',
      target,
      ...(target === 'macos'
        ? ['--foreground']
        : ['--browser', resolve(root, 'tooling/src/live-browser-wrapper.mjs')]),
    ],
    {
      cwd: resolve(root, 'apps/web'),
      env: rustEnvironment({
        ...process.env,
        HONGGUO_LIVE_HANDSHAKE: handshake,
        HONGGUO_LIVE_NONCE: nonce,
        HONGGUO_LIVE_BROWSER: browser,
        HONGGUO_LIVE_DEADLINE: String(handshakeDeadline),
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: target === 'web',
    },
  );
  let completed = false;
  const consume = async (stream) => {
    for await (const line of createInterface({ input: stream })) {
      console.log(line);
      await appendFile(resolve(artifacts, file + '.log'), line + '\n');
      const marker = 'LIVE_HISTORY:';
      const index = line.indexOf(marker);
      if (index < 0) continue;
      const record = JSON.parse(line.slice(index + marker.length));
      if (record.colorScheme !== colorScheme || !/^[a-z0-9-]+$/.test(record.stage))
        throw new Error('Invalid host evidence identity');
      if (record.stage.endsWith('-playback-error'))
        evidence.playbackFailures.push({
          colorScheme,
          stage: record.stage,
          at: record.at,
          ...record.details,
        });
      await writeFile(
        resolve(
          artifacts,
          `${record.stage}${record.stage.endsWith('-playback-error') ? '-' + record.details.attempt : ''}-${record.colorScheme}.json`,
        ),
        JSON.stringify(record, null, 2) + '\n',
      );
      if (record.stage === file.replace('.test.tsx', '') + '-complete') completed = true;
    }
  };
  let timer;
  let stageError;
  try {
    if (target === 'web') {
      const limit = handshakeDeadline;
      let request;
      while (!request) {
        if (Date.now() >= limit || host.exitCode !== null || host.signalCode)
          throw new Error('Browser origin handshake did not start');
        try {
          request = JSON.parse(await readFile(handshake + '.request.json', 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (!request) await pause(25);
      }
      if (
        request.nonce !== nonce ||
        request.nshPid !== host.pid ||
        !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(request.origin)
      )
        throw new Error('Browser origin handshake identity differs');
      await authorizeBrowser(request.origin, file, limit);
      await writeFile(handshake + '.ack.tmp', JSON.stringify({ nonce, origin: request.origin }));
      await rename(handshake + '.ack.tmp', handshake + '.ack.json');
    }
    await Promise.race([
      Promise.all([consume(host.stdout), consume(host.stderr), host.done]),
      api.done.then(() => {
        throw new Error('Rust API stopped during the host journey');
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => {
            reject(new Error('Live history host exceeded the stage/theme deadline'));
          },
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
    ensureActive();
    if (!completed) throw new Error('Missing successful stage completion evidence: ' + file);
  } catch (error) {
    stageError = error;
  } finally {
    clearTimeout(timer);
    try {
      await stopHost();
    } catch (error) {
      stageError ??= error;
    }
  }
  if (stageError) throw stageError;
}

try {
  ensureActive();
  const sources = await manifest('source-manifest');
  evidence.sourceManifestSha256 = hash(await readFile(resolve(artifacts, 'source-manifest.json')));
  evidence.nshVersion = output(executable('nsh'), ['--version']);
  if (evidence.nshVersion.split(/\s+/)[1] !== nshVersion)
    throw new Error(`Expected NSH ${nshVersion}: ${evidence.nshVersion}`);
  build = child(executable('cargo'), ['build', '--locked', '-p', 'hongguo-web-api']);
  await build.done;
  ensureActive();
  const cargoTarget = process.env.CARGO_TARGET_DIR ?? 'target';
  const binary = resolve(
    isAbsolute(cargoTarget) ? cargoTarget : resolve(root, cargoTarget),
    'debug/hongguo-web-api',
  );
  evidence.apiBinarySha256 = hash(await readFile(binary));
  let allowedOrigin;
  let apiPort;
  evidence.apiStarts = [];
  const start = async (deadline) => {
    ensureActive();
    const diagnostics = `api-${evidence.apiStarts.length + 1}.stderr.log`;
    const log = await openFile(resolve(artifacts, diagnostics), 'a');
    try {
      api = child(
        binary,
        [
          '--data-dir',
          resolve(artifacts, 'data'),
          ...(apiPort ? ['--port', apiPort] : []),
          ...(allowedOrigin ? ['--allow-origin', allowedOrigin] : []),
        ],
        {
          stdio: ['ignore', 'pipe', log.fd],
        },
      );
    } finally {
      await log.close();
    }
    const attempt = {
      pid: api.pid,
      startedAt: new Date().toISOString(),
      allowedOrigin: allowedOrigin ?? null,
      diagnostics,
    };
    evidence.apiStarts.push(attempt);
    const origin = await ready(
      api,
      Math.max(1, Math.min(15000, (deadline ?? themeDeadline ?? Date.now() + 15000) - Date.now())),
    );
    attempt.origin = origin;
    if (target === 'web') apiPort = new URL(origin).port;
    return origin;
  };
  let origin = await start();
  authorizeBrowser = async (nextOrigin, stage, deadline) => {
    const remaining = () => {
      const budget = deadline - Date.now();
      if (budget <= 0) throw new Error('Browser origin authorization timed out');
      return Math.min(5000, budget);
    };
    await stop(api);
    remaining();
    allowedOrigin = nextOrigin;
    const next = await start(deadline);
    if (next !== origin) throw new Error('Browser API origin changed');
    const response = await fetch(origin + '/api/v1/library', {
      headers: { Origin: nextOrigin },
      signal: AbortSignal.timeout(remaining()),
    });
    const denied = await fetch(origin + '/api/v1/library', {
      headers: { Origin: 'http://127.0.0.1:1' },
      signal: AbortSignal.timeout(remaining()),
    });
    if (
      response.status !== 200 ||
      response.headers.get('access-control-allow-origin') !== nextOrigin ||
      denied.status !== 403
    )
      throw new Error('Exact browser origin policy was not enforced');
    remaining();
    await writeFile(
      resolve(artifacts, stage + '-origin-policy.json'),
      JSON.stringify(
        { origin: nextOrigin, accepted: response.status, denied: denied.status },
        null,
        2,
      ),
    );
  };
  const search = await get(
    origin,
    `/api/v1/search?q=${encodeURIComponent(term)}&source=web`,
    'search',
  );
  const candidates = [];
  evidence.candidateChecks = [];
  for (const item of search.items.slice(0, 8)) {
    ensureActive();
    const { series_id, title } = item;
    if (candidates.some((candidate) => candidate.series_id === series_id)) continue;
    try {
      const detail = await get(
        origin,
        `/api/v1/series/detail?series_id=${encodeURIComponent(series_id)}&content_type=${encodeURIComponent(item.content_type ?? '')}`,
        'candidate-' + series_id,
      );
      // Resolve the catalog's canonical content type before choosing a live
      // candidate. Search results omit it, while the seasons endpoint carries
      // the value that the production player will use. Prefer entries without
      // the 1004 path for this journey, but retain it as a real-data fallback.
      const seasons = await get(
        origin,
        `/api/v1/series/seasons?series_id=${encodeURIComponent(series_id)}`,
        'candidate-seasons-' + series_id,
      );
      const contentType = seasons.items?.[0]?.drama?.content_type;
      const playable =
        detail.series_id === series_id &&
        detail.episodes?.some((episode) => !episode.locked && episode.video_id);
      evidence.candidateChecks.push({
        series_id,
        title,
        content_type: contentType ?? '',
        playable: !!playable,
      });
      if (playable) candidates.push({ series_id, title, content_type: contentType });
    } catch (error) {
      evidence.candidateChecks.push({ series_id, title, playable: false, error: error.message });
      ensureActive();
    }
  }
  candidates.sort(
    (a, b) =>
      Number(String(a.content_type ?? '') === '1004') -
      Number(String(b.content_type ?? '') === '1004'),
  );
  candidates.splice(2);
  if (candidates.length !== 2 || candidates[0].series_id === candidates[1].series_id)
    throw new Error(
      'Real search did not provide two distinct dramas with accessible episodes; no fabricated replacement',
    );
  evidence.candidates = candidates;
  if ((await get(origin, '/api/v1/library', 'library-before')).entries.length)
    throw new Error('Independent live history database was not empty');
  await runtimeConfig('web', origin);
  evidence.runtimeMainSha256 = hash(await readFile(runtime));
  evidence.uncovered = [
    target === 'macos'
      ? 'Desktop native, browser Web, TV, remote input and packaged installation'
      : 'Desktop native, TV, remote input and packaged deployment',
    'Foreground/key focus and manual keyboard input; native driver steps target the actual host',
  ];
  evidence.generatedStages = [];
  evidence.themes = [];
  // NSH 0.5 reads stdin through EOF before running; separate formal hosts let Node verify each commit.
  const stage = async (name, colorScheme, themeDeadline, steps) => {
    ensureActive();
    const deadline = Math.min(themeDeadline, Date.now() + 120000);
    if (Date.now() >= deadline) throw new Error('Theme exceeded 300 seconds');
    const file = `live-history-${name}-${colorScheme}.test.tsx`;
    const identity = file.replace('.test.tsx', '');
    const generated = `import {expect,open,test} from 'nsh/test';
const artifacts=${JSON.stringify(artifacts)};
const candidates=${JSON.stringify(candidates)};
const term=${JSON.stringify(term)};
const colorScheme=${JSON.stringify(colorScheme)};
const deadline=${deadline};
test(${JSON.stringify(identity)},async()=>{
 const budget=(limit=120000)=>{const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Stage/theme deadline exceeded');return Math.min(limit,remaining);};
 const app=await open('../App.tsx',{width:1440,height:1000,colorScheme,network:'live'});
 const first=candidates[0].series_id,second=candidates[1].series_id;
 let current=${JSON.stringify(name)};
 const record=(name:string,details:unknown={})=>console.log('LIVE_HISTORY:'+JSON.stringify({colorScheme,stage:name,at:new Date().toISOString(),details,requests:app.requests()}));
 const capture=async(name:string)=>{current=name;await app.wait(Math.min(300,budget()));await app.screenshot(artifacts+'/'+name+'-'+colorScheme+'.png');};
 const history=async()=>{
  for(let depth=0;!app.shows('id:nav-history')&&depth<5;depth++)await app.back();
  await app.waitFor('id:nav-history',{timeout:budget()});await app.press('id:nav-history');
  await app.waitFor('id:history-page',{timeout:budget()});
 };
 const manage=async(seriesId=first)=>{
  await history();await app.waitFor('id:history-'+seriesId,{timeout:budget()});
  await app.waitFor('id:history-manage',{timeout:budget()});await app.press('id:history-manage');
  await app.waitFor('id:history-select-'+seriesId,{timeout:budget()});
 };
 const clock=()=>{
  for(const text of app.texts()){
   const match=/^(\\d{2,}):(\\d{2})(?::(\\d{2}))?\\s*\\/\\s*/.exec(text);
   if(match)return match[3]===undefined?Number(match[1])*60+Number(match[2]):Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  }
  return -1;
 };
 const play=async(index:number,name:string,expected:string[])=>{
  const seriesId=candidates[index].series_id;
  record(name+'-navigate');
  await app.waitFor('id:nav-discover',{timeout:budget()});await app.press('id:nav-discover');
  await capture(name+'-discover');record(name+'-discover-ready');
  await app.waitFor('id:search-input',{timeout:budget()});await app.clear('id:search-input');
  await app.type('id:search-input',term);await app.press('id:search-submit');
  await capture(name+'-search');record(name+'-search-submitted');
  for(const candidate of candidates)await app.waitFor('id:drama-'+candidate.series_id,{timeout:budget()});
  record(name+'-search-ready');
  await app.press('id:drama-'+seriesId);
  await capture(name+'-detail');record(name+'-detail-opened');
  await app.waitUntil(()=>app.shows('id:detail-episodes-error')||(app.enabled('id:detail-start')&&!app.shows('id:detail-episodes-loading')),{timeout:budget()});
  if(app.shows('id:detail-episodes-error'))throw new Error('Real detail failed for '+seriesId+': '+app.texts().join(' | '));
  await capture(name+'-detail-ready');record(name+'-detail-ready',{texts:app.texts()});
  await app.press('id:detail-start');record(name+'-start-pressed');
  for(let attempt=0;attempt<2;attempt++){
   await app.waitUntil(()=>app.shows('text:播放遇到问题')||(app.shows('id:player-video')&&clock()>=0&&app.enabled('播放进度')),{timeout:budget(35000)});
   if(!app.shows('text:播放遇到问题'))break;
   expect(app.texts().includes('播放中')).toBe(false);
   await capture(name+'-playback-error-'+attempt);
   record(name+'-playback-error',{series_id:seriesId,attempt,texts:app.texts()});
   if(attempt===1)throw new Error('Real playback failed after one explicit UI retry: '+seriesId);
   await app.press('label:重试');record(name+'-retry-pressed',{series_id:seriesId});
  }
  await capture(name+'-player');record(name+'-player-opened');
  await app.waitUntil(()=>clock()>=0&&app.enabled('播放进度'),{timeout:budget()});
  record(name+'-media-ready');
  const initial=clock();await app.waitUntil(()=>clock()>=3&&clock()>=initial+3,{timeout:budget()});
  const progressed=clock();
  if(app.shows('id:season-picker')){
   expect(app.texts().includes('播放中')).toBe(true);
   await capture(name+'-playing-season');record(name+'-playing-season',{inspected:true});
  }else record(name+'-playing-season',{inspected:false});
  await app.press('label:暂停');
  expect(app.texts().includes('播放中')).toBe(false);
  await capture(name+'-paused');record(name+'-media-progress',{series_id:seriesId,initial,progressed});
  const pausedAt=clock();await app.wait(Math.min(1500,budget()));
  expect(clock()).toBe(pausedAt);
  await app.press('label:播放');
  await app.waitUntil(()=>clock()>=pausedAt+2,{timeout:budget(15000)});
  if(app.shows('id:season-picker'))expect(app.texts().includes('播放中')).toBe(true);
  await capture(name+'-resumed');record(name+'-media-resumed',{series_id:seriesId,pausedAt,resumedAt:clock()});
  ${name === 'first-play' || name === 'second-play' ? 'await app.wait(Math.min(32000,budget(35000)));' : ''}
  await app.press('label:暂停');
  expect(app.texts().includes('播放中')).toBe(false);
  await app.back();await history();
  for(const id of expected)await app.waitFor('id:history-'+id,{timeout:budget()});
  for(const candidate of candidates)expect(app.shows('id:history-'+candidate.series_id)).toBe(expected.includes(candidate.series_id));
  await capture(name+'-history');
 };
 const confirm=async(name:string,expected:string[]=[])=>{
  await app.waitFor('id:history-confirm-confirm',{timeout:budget()});await capture(name+'-confirm');
  await app.press('id:history-confirm-confirm');
  await app.waitUntil(()=>!app.shows('id:history-confirm-confirm'),{timeout:budget()});
  await app.waitUntil(()=>candidates.every(candidate=>app.shows('id:history-'+candidate.series_id)===expected.includes(candidate.series_id)),{timeout:budget()});
  if(expected.length===0)await app.waitFor('id:history-empty-discover',{timeout:budget()});
  await capture(name+(expected.length===0?'-empty':'-retained'));
 };
 try{
  await app.waitFor('id:nav-history',{timeout:budget(60000)});
  record(${JSON.stringify(identity + '-window-state')},{window:${target === 'macos' ? "app.window('main').state()" : 'null'},driverTarget:${JSON.stringify(target)}});
  expect(app.clock).toBe(null);
  ${steps}
  record(${JSON.stringify(identity + '-complete')},{texts:app.texts()});
 }catch(error){record(${JSON.stringify(name + '-failed')},{stage:current,error:String(error),texts:app.texts()});throw error;}
 finally{
  try{await app.screenshot(artifacts+'/'+${JSON.stringify(identity)}+'-final.png');record(${JSON.stringify(identity + '-final')},{stage:current,texts:app.texts()});}
  finally{app.dispose();}
 }
},${Math.max(1, deadline - Date.now())});
`;
    await writeFile(resolve(root, 'apps/web/.nsh', file), generated);
    await writeFile(resolve(artifacts, file), generated);
    evidence.generatedStages.push({ file, colorScheme, sha256: hash(generated), deadline });
    await runHost(file, colorScheme, deadline);
  };
  const library = async (name, expected) => {
    const snapshot = await get(origin, '/api/v1/library', name);
    const actual = snapshot.entries.map((entry) => entry.drama.series_id).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
      throw new Error(name + ': persistent history identities differ');
    return snapshot;
  };
  const checkpoint = (snapshot, index) => {
    const entry = snapshot.entries.find(
      (entry) => entry.drama.series_id === candidates[index].series_id,
    );
    if (!entry || entry.position < 3 || entry.duration <= 0)
      throw new Error('Real media checkpoint was not persisted: ' + JSON.stringify(entry));
  };
  for (const colorScheme of ['light', 'dark']) {
    const began = Date.now();
    const deadline = began + 300000;
    themeDeadline = deadline;
    const first = candidates[0].series_id;
    const second = candidates[1].series_id;
    let account = await get(origin, '/api/v1/account', 'statistics-account-' + colorScheme);
    const initialStatistics = await watchStatistics(
      origin,
      account,
      'statistics-initial-' + colorScheme,
    );
    if (statisticsDuration(initialStatistics) !== 0)
      throw new Error('Independent live watch statistics database was not empty');
    await library('initial-empty-' + colorScheme, []);
    await stage('first-play', colorScheme, deadline, "await play(0,'first-play',[first]);");
    const baseline = await library('first-play-' + colorScheme, [first]);
    checkpoint(baseline, 0);
    account = await get(origin, '/api/v1/account', 'statistics-account-first-play-' + colorScheme);
    const firstStatistics = await watchStatistics(
      origin,
      account,
      'statistics-first-play-' + colorScheme,
    );
    const firstDuration = statisticsDuration(firstStatistics);
    if (firstDuration <= 0)
      throw new Error('Real playback did not produce watch statistics in ' + colorScheme);
    evidence.watchStatistics.push({
      colorScheme,
      stage: 'first-play',
      durationMs: firstDuration,
      days: firstStatistics.days.map(({ day, duration_ms }) => ({ day, duration_ms })),
    });
    await stage(
      'statistics-panel',
      colorScheme,
      deadline,
      `
  await history();await app.waitFor('id:history-statistics',{timeout:budget()});
  await app.press('id:history-statistics');await app.waitFor('id:watch-statistics-panel',{timeout:budget()});
  await app.waitUntil(()=>!app.shows('text:正在读取观看统计…'),{timeout:budget()});
  expect(app.texts().some(text=>text.includes('累计观看'))).toBe(true);
  await capture('statistics-panel-real');record('statistics-panel-real',{durationMs:${firstDuration}});
  await app.press('id:watch-statistics-close');await app.waitFor('id:history-page',{timeout:budget()});`,
    );
    await stage(
      'cancel',
      colorScheme,
      deadline,
      `
  await manage();const before=app.requests().length;
  await app.press('id:history-remove-'+first);await app.waitFor('id:history-confirm-cancel',{timeout:budget()});
  await capture('cancel-single-confirm');await app.keyboard.press('enter');
  await app.waitUntil(()=>!app.shows('id:history-confirm-cancel'),{timeout:budget()});
  await capture('cancel-single-source');await app.keyboard.press('enter');
  await app.waitFor('id:history-confirm-cancel',{timeout:budget()});
  await app.keyboard.press('escape');
  await app.waitUntil(()=>!app.shows('id:history-confirm-cancel'),{timeout:budget()});
  await app.wait(Math.min(600,budget()));
  expect(app.requests().slice(before).filter(request=>request.method==='POST'&&new URL(request.url).pathname.startsWith('/api/v1/library')).length).toBe(0);
  expect(app.shows('id:history-'+first)).toBe(true);await capture('cancel-single-after');`,
    );
    const cancelled = await library('cancel-single-' + colorScheme, [first]);
    if (JSON.stringify(cancelled) !== JSON.stringify(baseline))
      throw new Error('Cancel changed persistent history in ' + colorScheme);
    await stage(
      'remove',
      colorScheme,
      deadline,
      `
  await manage();await app.press('id:history-remove-'+first);await confirm('remove-first');`,
    );
    await library('removed-' + colorScheme, []);
    await stage('replay', colorScheme, deadline, "await play(0,'first-recreated',[first]);");
    checkpoint(await library('recreated-' + colorScheme, [first]), 0);
    await stage(
      'second-play',
      colorScheme,
      deadline,
      "await play(1,'second-play',[first,second]);",
    );
    const populated = await library('two-played-' + colorScheme, [first, second]);
    checkpoint(populated, 0);
    checkpoint(populated, 1);
    account = await get(origin, '/api/v1/account', 'statistics-account-two-played-' + colorScheme);
    const populatedStatistics = await watchStatistics(
      origin,
      account,
      'statistics-two-played-' + colorScheme,
    );
    const populatedDuration = statisticsDuration(populatedStatistics);
    if (populatedDuration < firstDuration)
      throw new Error('Real watch statistics regressed after a second playback');
    evidence.watchStatistics.push({
      colorScheme,
      stage: 'two-played',
      durationMs: populatedDuration,
      days: populatedStatistics.days.map(({ day, duration_ms }) => ({ day, duration_ms })),
    });
    await stop(api);
    origin = await start();
    await runtimeConfig('web', origin);
    evidence['runtimePopulatedReopenSha256-' + colorScheme] = hash(await readFile(runtime));
    const restartedPopulated = await library('restarted-populated-' + colorScheme, [first, second]);
    if (JSON.stringify(restartedPopulated) !== JSON.stringify(populated))
      throw new Error('Rust API restart changed real populated history in ' + colorScheme);
    const restartedAccount = await get(
      origin,
      '/api/v1/account',
      'statistics-account-restarted-' + colorScheme,
    );
    const restartedStatistics = await watchStatistics(
      origin,
      restartedAccount,
      'statistics-restarted-' + colorScheme,
    );
    const restartedDuration = statisticsDuration(restartedStatistics);
    if (restartedDuration !== populatedDuration)
      throw new Error('Rust API restart changed real watch statistics in ' + colorScheme);
    evidence.watchStatistics.push({
      colorScheme,
      stage: 'restarted',
      durationMs: restartedDuration,
      days: restartedStatistics.days.map(({ day, duration_ms }) => ({ day, duration_ms })),
    });
    await stage(
      'statistics-reset',
      colorScheme,
      deadline,
      `
  await history();await app.waitFor('id:history-statistics',{timeout:budget()});
  await app.press('id:history-statistics');await app.waitFor('id:watch-statistics-panel',{timeout:budget()});
  await app.waitUntil(()=>!app.shows('text:正在读取观看统计…'),{timeout:budget()});
  await app.press('id:watch-statistics-reset');await app.waitFor('id:watch-statistics-reset-confirm',{timeout:budget()});
  await app.press('id:watch-statistics-reset-confirm-confirm');await app.waitUntil(()=>!app.shows('id:watch-statistics-reset-confirm'),{timeout:budget()});
  await app.waitUntil(()=>app.shows('text:这个周期还没有观看统计。开始观看后会显示在这里。'),{timeout:budget()});
  await capture('statistics-reset-empty');record('statistics-reset-empty',{historyRetained:true});
  await app.press('id:watch-statistics-close');await app.waitFor('id:history-page',{timeout:budget()});`,
    );
    const resetStatistics = await watchStatistics(
      origin,
      restartedAccount,
      'statistics-reset-' + colorScheme,
    );
    if (statisticsDuration(resetStatistics) !== 0 || resetStatistics.days.length !== 0)
      throw new Error('Real statistics reset did not clear statistics in ' + colorScheme);
    const historyAfterStatisticsReset = await library(
      'history-after-statistics-reset-' + colorScheme,
      [first, second],
    );
    if (JSON.stringify(historyAfterStatisticsReset) !== JSON.stringify(restartedPopulated))
      throw new Error('Statistics reset changed real viewing history in ' + colorScheme);
    evidence.watchStatistics.push({
      colorScheme,
      stage: 'reset',
      durationMs: 0,
      historyEntries: historyAfterStatisticsReset.entries.map((entry) => entry.drama.series_id),
    });
    await stage(
      'reopen-populated',
      colorScheme,
      deadline,
      `
  await history();
  for(const candidate of candidates)await app.waitFor('id:history-'+candidate.series_id,{timeout:budget()});
  expect(app.shows('id:history-empty-discover')).toBe(false);await capture('reopened-populated');`,
    );
    if (
      JSON.stringify(await library('reopened-populated-' + colorScheme, [first, second])) !==
      JSON.stringify(populated)
    )
      throw new Error('Reopening the formal app changed real populated history in ' + colorScheme);
    await stage(
      'keyboard-management',
      colorScheme,
      deadline,
      `
  await manage();const before=app.requests().length;
  await app.keyboard.press('tab');await capture('keyboard-select-all-focus');
  await app.keyboard.press('space');await app.waitFor('text:删除所选（2）',{timeout:budget()});
  await app.keyboard.press('space');await app.waitFor('text:删除所选（0）',{timeout:budget()});
  const cancelScope=async(name:string,title:string)=>{
   await app.keyboard.press('enter');await app.waitFor('id:history-confirm',{timeout:budget()});
   expect(app.texts()).toContain(title);await capture(name+'-default-cancel');
   await app.keyboard.press('enter');await app.waitFor('id:history-confirm',{state:'gone',timeout:budget()});
   await capture(name+'-source');await app.keyboard.press('enter');
   await app.waitFor('id:history-confirm',{timeout:budget()});expect(app.texts()).toContain(title);
   await app.keyboard.press('escape');await app.waitFor('id:history-confirm',{state:'gone',timeout:budget()});
   await capture(name+'-escape-source');
  };
  await app.keyboard.press('tab');
  await cancelScope('keyboard-clear','清空本机观看记录？');
  await app.keyboard.press('tab');await app.keyboard.press('space');
  await app.waitFor('text:删除所选（1）',{timeout:budget()});await capture('keyboard-row-selected');
  await app.keyboard.press('shift+tab');await app.keyboard.press('shift+tab');
  await cancelScope('keyboard-selected','删除所选观看记录？');
  await app.keyboard.press('tab');await app.keyboard.press('tab');await app.keyboard.press('tab');
  await cancelScope('keyboard-single',${JSON.stringify(`移除《${populated.entries[0].drama.title}》的观看记录？`)});
  for(let step=0;step<5;step++)await app.keyboard.press('shift+tab');
  await app.keyboard.press('enter');await app.waitFor('id:history-select-all',{state:'gone',timeout:budget()});
  await capture('keyboard-finished');await app.keyboard.press('enter');
  await app.waitFor('id:history-select-all',{timeout:budget()});
  await app.waitFor('text:删除所选（0）',{timeout:budget()});
  expect(app.requests().slice(before).filter(request=>request.method==='POST'&&new URL(request.url).pathname.startsWith('/api/v1/library')).length).toBe(0);
  record('keyboard-management-no-writes',{texts:app.texts()});`,
    );
    if (
      JSON.stringify(await library('keyboard-unchanged-' + colorScheme, [first, second])) !==
      JSON.stringify(populated)
    )
      throw new Error('Keyboard cancellation changed real persistent history in ' + colorScheme);
    await stage(
      'selected-remove',
      colorScheme,
      deadline,
      `
  await manage();await app.press('id:history-select-'+first);
  await app.waitUntil(()=>app.enabled('id:history-delete-selected'),{timeout:budget()});
  await capture('selected-first');await app.press('id:history-delete-selected');
  await confirm('selected-remove-first',[second]);
  await app.keyboard.press('enter');
  await app.waitFor('id:detail-start',{timeout:budget()});
  await app.waitFor('text:'+candidates[1].title,{timeout:budget()});
  await app.waitUntil(()=>app.shows('id:detail-episodes-error')||(app.enabled('id:detail-start')&&!app.shows('id:detail-episodes-loading')),{timeout:budget(35000)});
  if(app.shows('id:detail-episodes-error'))throw new Error('Retained real detail failed: '+app.texts().join(' | '));
  await capture('selected-remove-neighbor-detail');
  record('selected-remove-neighbor',{series_id:second,texts:app.texts()});`,
    );
    const selected = await library('selected-removed-' + colorScheme, [second]);
    checkpoint(selected, 1);
    if (
      JSON.stringify(selected.entries[0]) !==
      JSON.stringify(populated.entries.find((entry) => entry.drama.series_id === second))
    )
      throw new Error('Selected deletion changed the retained real entry in ' + colorScheme);
    await stage(
      'clear',
      colorScheme,
      deadline,
      `
  await manage(second);await app.press('id:history-clear');await confirm('clear-all');`,
    );
    await library('cleared-' + colorScheme, []);
    const searches = await get(origin, '/api/v1/search/history', 'searches-' + colorScheme);
    if (!searches.items.includes(term)) throw new Error('Real search term was not retained');
    await stop(api);
    origin = await start();
    await runtimeConfig('web', origin);
    evidence['runtimeReopenSha256-' + colorScheme] = hash(await readFile(runtime));
    await library('restarted-empty-' + colorScheme, []);
    const retained = await get(
      origin,
      '/api/v1/search/history',
      'restarted-searches-' + colorScheme,
    );
    if (JSON.stringify(retained) !== JSON.stringify(searches))
      throw new Error('Rust API restart changed retained search history');
    await stage(
      'reopen',
      colorScheme,
      deadline,
      `
  await history();await app.waitFor('id:history-empty-discover',{timeout:budget()});
  for(const candidate of candidates)expect(app.shows('id:history-'+candidate.series_id)).toBe(false);
  await capture('reopened-empty');await app.press('id:history-empty-discover');
  await app.waitFor('id:nav-search',{timeout:budget()});await app.press('id:nav-search');
  await app.waitFor('id:recent-search-'+term,{timeout:budget()});await capture('reopened-searches');`,
    );
    await library('reopened-final-' + colorScheme, []);
    if (Date.now() >= deadline) throw new Error('Theme exceeded 300 seconds: ' + colorScheme);
    evidence.themes.push({
      colorScheme,
      elapsedMs: Date.now() - began,
      apiRestartVerified: true,
      populatedRestartVerified: true,
      selectedDeletionVerified: true,
    });
  }
  themeDeadline = undefined;
  const after = await manifest('source-manifest-after');
  const beforeMap = new Map(sources.entries.map(({ path, sha256 }) => [path, sha256]));
  const changed = after.entries
    .filter(({ path, sha256 }) => beforeMap.get(path) !== sha256)
    .map(({ path }) => path);
  for (const { path } of sources.entries)
    if (!after.entries.some((entry) => entry.path === path)) changed.push(path);
  if (changed.length || sources.head !== after.head)
    throw new Error('Sources changed during real acceptance: ' + changed.join(', '));
  evidence.apiRestartVerified = true;
  evidence.populatedRestartVerified = true;
  evidence.selectedDeletionVerified = true;
  evidence.uiReopenThemes = ['light', 'dark'];
  ensureActive();
  evidence.journeyCompleted = true;
  if (evidence.playbackFailures.length)
    throw new Error(
      'Journey completed with recorded playback failures; no uninterrupted acceptance',
    );
  evidence.passed = true;
} catch (error) {
  evidence.error = error.message;
  runError = error;
} finally {
  const failures = [];
  try {
    await stopHost();
  } catch (error) {
    failures.push(error.message);
  }
  const cleanup = await Promise.allSettled([
    (async () => {
      await writeFile(runtime, previous);
      const restored = await readFile(runtime);
      evidence.runtimeRestoredSha256 = hash(restored);
      if (!restored.equals(previous)) throw new Error('Runtime restoration bytes differ');
    })(),
    stop(api),
    stop(build),
  ]);
  for (const result of cleanup)
    if (result.status === 'rejected') failures.push(result.reason.message);
  failures.push(...hostCleanupErrors);
  if (interrupted || failures.length) evidence.passed = false;
  evidence.cleanupErrors = [...new Set(failures)];
  evidence.interrupted = interrupted;
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  evidence.completedAt = new Date().toISOString();
  await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('Live history evidence: ' + artifacts);
}
if (runError) throw runError;
if (evidence.cleanupErrors.length)
  throw new Error('Live history cleanup failed: ' + evidence.cleanupErrors.join('; '));
if (interrupted) throw new Error('Live history acceptance interrupted');
