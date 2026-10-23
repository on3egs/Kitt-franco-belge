// GitHub Pages currently serves main:/, not only the workflow's dist artifact.
// Always run a fresh build here: tracked dist/index may be an older version.
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.platform==='win32'?'npx.cmd':'npx',['vite','build'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
const built=path.join(root,'dist/public');
const html=readFileSync(path.join(built,'index.html'),'utf8');
if(!html.includes('theme-color'))throw Error('Unexpected build output; refusing root update');
copyFileSync(path.join(built,'index.html'),path.join(root,'index.html'));
copyFileSync(path.join(root,'client/public/favicon.svg'),path.join(root,'favicon.svg'));
for(const name of readdirSync(path.join(built,'assets')))copyFileSync(path.join(built,'assets',name),path.join(root,'assets',name));
console.log('Actual Pages root synchronized. Review index.html and new assets before committing.');
