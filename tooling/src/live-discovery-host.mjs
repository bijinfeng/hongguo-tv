import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { ready, stop } from './dev.mjs';
import {
  cargo,
  child,
  executable,
  output,
  root,
  runtimeConfig,
  rustEnvironment,
} from './process.mjs';

// Opt-in real upstream reads; never substitute fixture responses when the service fails.
if (process.argv.slice(2).join(' ') !== 'macos --anonymous-live')
  throw new Error(
    'Expected macos --anonymous-live; requires a visible macOS host and real network',
  );
const artifacts = resolve(
  root,
  'artifacts/live-discovery',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await mkdir(artifacts, { recursive: true });
const runtime = resolve(root, 'apps/web/runtime.generated.json');
const previous = await readFile(runtime);
await cargo(['build', '--locked', '-p', 'hongguo-web-api']);
const target = process.env.CARGO_TARGET_DIR ?? 'target';
const binary = resolve(
  isAbsolute(target) ? target : resolve(root, target),
  'debug/hongguo-web-api',
);
const api = child(binary, ['--data-dir', resolve(artifacts, 'data')], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
const evidence = {
  startedAt: new Date().toISOString(),
  source: 'current anonymous upstream through production Rust API',
  entry: 'apps/web/App.tsx',
  host: 'macos',
  syntheticResponses: false,
  passed: false,
  sourceHead: output('git', ['rev-parse', 'HEAD']),
  entrySha256: createHash('sha256')
    .update(await readFile(resolve(root, 'apps/web/App.tsx')))
    .digest('hex'),
};
let host;
let runError;
let interrupted = false;
const onSignal = () => {
  interrupted = true;
  void stop(host)
    .then(() => stop(api))
    .catch(() => {});
};
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
try {
  const origin = await ready(api);
  const get = async (path, name) => {
    if (interrupted) throw new Error('Live acceptance interrupted');
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(35000) });
    const json = await response.json();
    await writeFile(resolve(artifacts, name + '.json'), JSON.stringify(json, null, 2) + '\n');
    if (!response.ok || !json.ok) throw new Error(`Live ${path}: HTTP ${response.status}`);
    return json.data;
  };
  const term = '重生';
  const search = await get(`/api/v1/search?q=${encodeURIComponent(term)}&source=web`, 'search');
  const candidates = search.items.slice(0, 4);
  if (!candidates.length)
    throw new Error('Real search returned no items; no fabricated replacement');
  Object.assign(evidence, {
    term,
    candidates: candidates.map(({ series_id, title }) => ({ series_id, title })),
    actorActionsAccepted: false,
  });
  await runtimeConfig('web', origin);
  const file = resolve(root, 'apps/web/.nsh/LiveDiscovery.test.tsx');
  await writeFile(
    file,
    `import {expect,open,test} from 'nsh/test';
const artifacts=${JSON.stringify(artifacts)};
const candidates=${JSON.stringify(candidates.map(({ series_id, title }) => ({ series_id, title })))};
for(const colorScheme of ['light','dark'] as const) test('real anonymous search detail related return '+colorScheme,async()=>{
 const app=await open('../App.tsx',{width:1440,height:1000,colorScheme,network:'live'});
 const capture=async(name:string)=>{await app.wait(600);await app.screenshot(artifacts+'/'+name+'-'+colorScheme+'.png');};
 let accepted:{seriesId:string;title:string;relatedId:string;relatedTitle:string;actorSection:boolean}|undefined;
 try {
  await app.waitUntil(()=>app.window('main').state()?.focused===true,{timeout:60000});
  await app.type('id:search-input',${JSON.stringify(term)});
  await app.press('id:search-submit');
  await app.waitFor('id:drama-'+candidates[0].series_id,{timeout:35000});
  await capture('search');
  let source:typeof candidates[number]|undefined;
  for(const candidate of candidates){
   await app.waitFor('id:drama-'+candidate.series_id);
   await app.press('id:drama-'+candidate.series_id);
   await app.waitUntil(()=>app.enabled('id:detail-start')&&!app.shows('id:detail-episodes-loading'),{timeout:35000});
   await capture('detail-'+candidate.series_id);
   if(app.count('id:detail-related')){source=candidate;break;}
   await app.back();
  }
  if(!source) throw new Error('No real related works in the first four current results; no fabricated replacement');
  const actorSection=app.count('id:detail-actors')>0;
  await app.waitFor('id:detail-related',{timeout:35000});
  await app.waitUntil(()=>!app.shows('id:detail-episodes-loading'),{timeout:35000});
  for(let step=0;step<12 && !app.shows('相关作品');step++) await app.scroll('id:detail-scroll',250);
  await app.scroll('id:detail-scroll',450);
  await app.waitUntil(()=>app.texts().includes('相关作品')&&!app.shows('id:detail-episodes-loading'),{timeout:35000});
  const texts=app.texts();
  const heading=texts.indexOf('相关作品');
  const relatedTitle=texts[heading+1];
  if(heading<0||!relatedTitle) throw new Error('Real related title is not reachable');
  await capture('related');
  const before=app.requests().length;
  await app.press('text:'+relatedTitle);
  await app.waitFor('id:navigation-page-2',{timeout:35000});
  await app.waitUntil(()=>app.enabled('id:detail-start')&&!app.shows('id:detail-episodes-loading'),{timeout:35000});
  const detailRequest=app.requests().slice(before).find(r=>new URL(r.url).pathname==='/api/v1/series/detail');
  const relatedId=detailRequest&&new URL(detailRequest.url).searchParams.get('series_id');
  if(!relatedId||relatedId===source.series_id) throw new Error('Related navigation did not request a distinct exact identity');
  expect(app.shows('id:navigation-page-2 >> text:'+relatedTitle)).toBe(true);
  accepted={seriesId:source.series_id,title:source.title,relatedId,relatedTitle,actorSection};
  await capture('related-detail');
  await app.back();
  await app.waitFor('id:navigation-page-1');
  await app.waitFor('id:drama-'+relatedId);
  await capture('related-return');
  const beforeEnter=app.requests().length;
  await app.keyboard.press('enter');
  await app.waitFor('id:navigation-page-2',{timeout:35000});
  await app.waitUntil(()=>app.requests().slice(beforeEnter).some(r=>{
   const url=new URL(r.url);return url.pathname==='/api/v1/series/detail'&&url.searchParams.get('series_id')===relatedId;
  }),{timeout:35000});
  await app.waitUntil(()=>app.enabled('id:detail-start')&&!app.shows('id:detail-episodes-loading'),{timeout:35000});
  expect(app.shows('id:navigation-page-2 >> text:'+relatedTitle)).toBe(true);
  await app.back();
  await app.waitFor('id:navigation-page-1');
  await app.back();
  await app.waitFor('id:navigation-page-0');
  await app.waitFor('id:drama-'+source.series_id);
  await capture('search-return');
  expect(app.requests().some(r=>r.method==='POST' && new URL(r.url).pathname!=='/api/v1/search/history')).toBe(false);
 } finally {
  await capture('final');
  console.log('LIVE_DISCOVERY_REQUESTS:'+JSON.stringify({colorScheme,accepted,requests:app.requests()}));
 }
},180000);
`,
  );
  if (interrupted) throw new Error('Live acceptance interrupted');
  host = child(
    executable('nsh'),
    ['test', '.nsh/LiveDiscovery.test.tsx', '--target', 'macos', '--foreground'],
    {
      cwd: resolve(root, 'apps/web'),
      env: rustEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const captured = new Set();
  const consume = async (stream) => {
    for await (const line of createInterface({ input: stream })) {
      console.log(line);
      const marker = 'LIVE_DISCOVERY_REQUESTS:';
      const index = line.indexOf(marker);
      if (index >= 0) {
        const record = JSON.parse(line.slice(index + marker.length));
        if (!['light', 'dark'].includes(record.colorScheme)) throw new Error('Unknown host theme');
        await writeFile(
          resolve(artifacts, `requests-${record.colorScheme}.json`),
          JSON.stringify(record.requests, null, 2) + '\n',
        );
        await writeFile(
          resolve(artifacts, `journey-${record.colorScheme}.json`),
          JSON.stringify(record.accepted ?? null, null, 2) + '\n',
        );
        captured.add(record.colorScheme);
      }
    }
  };
  await Promise.all([consume(host.stdout), consume(host.stderr)]);
  await host.done;
  if (captured.size !== 2) throw new Error('Missing live host request evidence');
  const library = await get('/api/v1/library', 'library-after');
  if (library.entries.length) throw new Error('Browsing unexpectedly created viewing history');
  const history = await get('/api/v1/search/history', 'search-history-after');
  if (!history.items.includes(term)) throw new Error('The actual UI search was not persisted');
  evidence.passed = true;
} catch (error) {
  evidence.error = error.message;
  runError = error;
} finally {
  const failures = [];
  try {
    await stop(host);
  } catch (error) {
    failures.push(error.message);
  }
  const cleanup = await Promise.allSettled([
    (async () => {
      await writeFile(runtime, previous);
      if (!(await readFile(runtime)).equals(previous))
        throw new Error('Runtime restoration bytes differ');
    })(),
    stop(api),
  ]);
  for (const result of cleanup)
    if (result.status === 'rejected') failures.push(result.reason.message);
  if (interrupted || failures.length) evidence.passed = false;
  evidence.cleanupErrors = failures;
  evidence.interrupted = interrupted;
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  evidence.completedAt = new Date().toISOString();
  await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Live discovery evidence: ${artifacts}`);
}
if (runError) throw runError;
if (evidence.cleanupErrors.length)
  throw new Error(`Live acceptance cleanup failed: ${evidence.cleanupErrors.join('; ')}`);
if (interrupted) throw new Error('Live acceptance interrupted');
