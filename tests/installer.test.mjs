import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { install } from '../scripts/install.mjs';
import { toolRoot } from '../dist-cli/project.js';
const installer = path.join(toolRoot,'install.sh');
const quote = value => "'"+value.replaceAll("'", "'\"'\"'")+"'";

test('installer rejects missing/old Node before npm, download or destination writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(),'bonko-installer-preflight-'));
  try {
    const fake = path.join(root,'path'); await mkdir(fake);
    for (const version of [null,'v18.20.0','v22.11.0','invalid']) {
      if (version) await writeFile(path.join(fake,'node'),`#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${quote(version)}; else exec ${quote(process.execPath)} "$@"; fi\n`,{mode:0o755});
      const result=spawnSync('/bin/sh',[installer,'--prefix',path.join(root,'destination')],{env:{PATH:fake},encoding:'utf8'});
      assert.equal(result.status,1); assert.match(result.stderr,/Node.js/);
      await assert.rejects(access(path.join(root,'destination')),{code:'ENOENT'});
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('compatible Node proceeds to npm validation and malformed installer options fail', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'bonko-installer-npm-'));
  try {
    await writeFile(path.join(root,'node'),`#!/bin/sh\nexec ${quote(process.execPath)} "$@"\n`,{mode:0o755});
    const result=spawnSync('/bin/sh',[installer],{env:{PATH:root},encoding:'utf8'});
    assert.equal(result.status,1); assert.match(result.stderr,/npm is missing/);
    await assert.rejects(install(['--wat']),/Unknown/);
    await assert.rejects(install(['--base-url','http://example.test']),/HTTPS/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('checksum failure and unrelated command leave installation inactive', async () => {
  const root = await mkdtemp(path.join(tmpdir(),'bonko-installer-integrity-'));
  try {
    const archive=path.join(root,'archive.tgz'); await writeFile(archive,'not a package');
    const prefix=path.join(root,'install');
    await assert.rejects(install(['--archive',archive,'--sha256','0'.repeat(64),'--prefix',prefix]),/checksum mismatch/);
    await assert.rejects(access(path.join(prefix,'bin/bonko')),{code:'ENOENT'});
    await assert.rejects(access(path.join(prefix,'.install-lock')),{code:'ENOENT'});
    await writeFile(path.join(prefix,'bin/bonko'),'existing command');
    const digest=createHash('sha256').update(await readFile(archive)).digest('hex');
    await assert.rejects(install(['--archive',archive,'--sha256',digest,'--prefix',prefix]),/existing command/);
    assert.equal(await readFile(path.join(prefix,'bin/bonko'),'utf8'),'existing command');
  } finally { await rm(root,{recursive:true,force:true}); }
});
