#!/usr/bin/env node
// Turn the single-file build (dist-single/index.html) into an HTML fragment for hosts that
// supply their own <!doctype>/<html>/<head>/<body> skeleton: keeps <title>, <meta name=theme-color>,
// every <style>/<script> and the body content, in order.
//
//   npm run build:single && node scripts/make_artifact.mjs [out.html]
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const out = process.argv[2] ?? 'dist-single/fragment.html';
const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? '<title>半亩 · Half-Acre</title>';
const head = src.slice(0, src.indexOf('</head>'));
const headBits = [
  ...pick.call(null, /<meta name="description"[^>]*>/g),
  ...[...head.matchAll(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g)].map((m) => m[0]),
];
const body = src.slice(src.indexOf('<body'), src.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
writeFileSync(out, [title, ...headBits, body.trim()].join('\n'));
console.log(`wrote ${out} (${(Buffer.byteLength(readFileSync(out)) / 1024).toFixed(0)} KB)`);
