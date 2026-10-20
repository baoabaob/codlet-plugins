import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,relative,isAbsolute,basename} from 'node:path';
import {buildPlugin} from '../frontend/build-plugin.mjs';

test('CSS and SVG checkout line endings do not change signed package bundle bytes',async()=>{
  const temporary=await realpath(tmpdir()),root=await mkdtemp(resolve(temporary,'codlet-text-assets-'));
  try{
    await writeFile(resolve(root,'entry.js'),"import css from './style.css';import icon from './icon.svg';module.exports={css,icon};\n");
    const css='.plugin {\n  color: red;\n}\n',svg='<svg xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M0 0L1 1\"/>\n</svg>\n';
    await writeFile(resolve(root,'style.css'),css);await writeFile(resolve(root,'icon.svg'),svg);
    const lf=await buildPlugin(root,'entry.js');
    await writeFile(resolve(root,'style.css'),css.replaceAll('\n','\r\n'));
    await writeFile(resolve(root,'icon.svg'),svg.replaceAll('\n','\r\n'));
    const crlf=await buildPlugin(root,'entry.js');
    assert.equal(lf.code,crlf.code);
    assert.deepEqual(lf.inputs,crlf.inputs);
  }finally{
    const part=relative(temporary,root);
    assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&basename(root).startsWith('codlet-text-assets-'));
    await rm(root,{recursive:true});
  }
});
