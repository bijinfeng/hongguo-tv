import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const pages = ["index.html", "desktop.html", "tv.html", "components/index.html"];
for (const p of pages) {
  const html = read(p);
  assert.ok(html.includes('lang="zh-CN"'), p + " language");
  assert.ok(!/\{\{[^}]+\}\}/.test(html), p + " placeholders");
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (ref.startsWith("#")) continue;
    assert.ok(!/^https?:/.test(ref), p + " has remote runtime dependency");
    assert.ok(
      fs.existsSync(path.resolve(root, path.dirname(p), ref.split("#")[0])),
      p + " missing " + ref,
    );
  }
  assert.equal(
    (html.match(/<script(?:\s|>)/g) || []).length,
    (html.match(/<\/script>/g) || []).length,
    p + " scripts closed",
  );
}
for (const file of fs
  .readdirSync(path.join(root, "assets"))
  .filter((x) => x.endsWith(".js")))
  new vm.Script(read("assets/" + file), { filename: file });
const box = { window: {}, document: { addEventListener() {} } };
vm.runInNewContext(read("assets/catalog.js"), box);
const T = box.window.Theater;
const counts = {
  song: 113,
  northeast: 96,
  exam: 786,
  eighties: 317,
  basin: 288,
  demon: 1000,
  mortal: 117,
  marriage: 135,
  demons: 202,
  guard: 100,
  nova: 60,
};
assert.equal(T.dramas.length, Object.keys(counts).length);
assert.equal(new Set(T.dramas.map((d) => d.id)).size, T.dramas.length);
for (const d of T.dramas) {
  assert.equal(d.episodes, counts[d.id]);
  assert.ok(d.tags.length > 0);
  assert.ok(
    ![
      "score",
      "heat",
      "likes",
      "views",
      "followers",
      "comments",
      "rating",
    ].some((k) => k in d),
  );
  assert.ok(
    d.poster && fs.existsSync(path.join(root, d.poster)),
    d.id + " local cover",
  );
  assert.ok(d.posterWidth > 0 && d.posterHeight > 0);
  assert.match(T.poster(d), /object|real-poster/);
  assert.match(T.card(d), /aspect-ratio:/);
}
assert.equal(T.status(T.get("nova")), "更新至 60 集");
assert.equal(T.seasonName(T.get("song")), "第 11 季");
assert.ok(!T.nav("desktop").includes("官网公开内容"));
assert.match(read("assets/app.js"), /data-od-id="app-updates"/);
assert.match(read("assets/app.js"), /data-action="check-updates"/);
for (const file of [
  "index.html",
  "components/index.html",
  "tv.html",
  "assets/app.js",
  "assets/catalog.js",
]) {
  const source = read(file);
  assert.ok(!source.includes("官网公开内容 · 设计预览"), file + " explanatory marker");
  assert.ok(!source.includes("官网公开内容 / 播放与片单"), file + " explanatory marker");
}
for (const [kind, list] of Object.entries(T.initial))
  for (const item of list) {
    const id = typeof item === "string" ? item : item.id;
    assert.ok(
      T.dramas.some((d) => d.id === id),
      kind + " seed id",
    );
  }
const manifest = JSON.parse(read("assets/media/sources.json"));
for (const d of T.dramas) {
  const m = manifest.find((a) => a.id === d.id);
  assert.ok(m && m.status === "localized", d.id + " provenance");
  assert.equal(m.width, d.posterWidth);
  assert.equal(m.height, d.posterHeight);
}
console.log(
  "通过：4 个入口、本地资源、全部脚本语法、11 部官网剧目与集数、真实季信息、海报尺寸与来源、无社交数据字段",
);
