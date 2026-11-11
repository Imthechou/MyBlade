import assert from 'node:assert/strict';
import fs from 'node:fs';
const scene=JSON.parse(fs.readFileSync('assets/scene.scene','utf8'));
const script=fs.readFileSync('assets/LabBootstrap.ts','utf8');
const scriptMeta=JSON.parse(fs.readFileSync('assets/LabBootstrap.ts.meta','utf8'));
const sceneMeta=JSON.parse(fs.readFileSync('assets/scene.scene.meta','utf8'));
const project=JSON.parse(fs.readFileSync('package.json','utf8'));
function compact(uuid) {
  const raw=uuid.replace(/-/g,'').toLowerCase();
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let ret=raw.slice(0,5);
  for(let i=5;i<32;i+=3){ const code=parseInt(raw.slice(i,i+3),16);ret+=alphabet[(code>>6)&63]+alphabet[code&63]; }
  return ret;
}
assert.equal(project.type,'3d');
assert.equal(scene[0].__type__,'cc.SceneAsset');
assert.equal(scene[1].__type__,'cc.Scene');
assert.equal(scene[1]._id,sceneMeta.uuid);
assert.equal(scene[0].scene.__id__,1);
for(const id of scene[1]._children.map(c=>c.__id__)) {
  assert.ok(scene[id] && scene[id].__type__==='cc.Node','missing scene child '+id);
}
const bootstrap=scene.find(x=>x?.__type__===compact(scriptMeta.uuid));
assert.ok(bootstrap,'script class id does not match .meta compressed UUID');
assert.equal(scene[bootstrap.node.__id__]._name,'Lab Controller');
assert.match(script,/MeshUtils\.createMesh/);
assert.match(script,/builtin-standard/);
assert.match(script,/RigidBody/);
assert.match(script,/BoxCollider/);
assert.match(script,/@ccclass\('LabBootstrap'\)/);
assert.match(script,/__MYBLADE/);
console.log('PASS: Cocos 3D project/scene/meta/script structural checks');
