import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const files=[path.join(root,'client/index.html')];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.html')&&!entry.name.includes('.before-')&&entry.name!=='404.html')files.push(file);}}
walk(path.join(root,'client/public'));
const tags='\n<link rel="stylesheet" href="/site-assets/cockpit.css?v=20261026-1">\n<script src="/site-assets/cockpit.js?v=20261026-1" defer></script>\n';
for(const file of files){let html=fs.readFileSync(file,'utf8');if(html.includes('/site-assets/cockpit.js'))continue;if(!/<\/head>/i.test(html))throw Error('Missing head: '+file);html=html.replace(/<\/head>/i,tags+'</head>');fs.writeFileSync(file,html);}
console.log(`Cockpit attached to ${files.length} HTML entry points; React routes share the main entry.`);
