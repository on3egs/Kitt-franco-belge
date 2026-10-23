const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const script=fs.readFileSync('404.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const restore=fs.readFileSync('client/index.html','utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const tests=[
 ['https://kitt-franco-belge.be/videos','/videos'],
 ['https://kitt-franco-belge.be/musique','/musique'],
 ['https://kitt-franco-belge.be/documents?tag=audio&sort=date#latest','/documents?tag=audio&sort=date#latest'],
 ['https://kitt-franco-belge.be/absent/nested','/absent/nested'],
 ['https://kitt-franco-belge.be/a&b?x=a&y=b','/a&b?x=a&y=b'],
 ['https://on3egs.github.io/Kitt-franco-belge/videos','/Kitt-franco-belge/videos'],
];
for(const [address,expected]of tests){let next;const l=new URL(address);l.replace=value=>next=value;vm.runInNewContext(script,{window:{location:l}});const landing=new URL(next);assert.ok(landing.pathname==='/'||landing.pathname==='/Kitt-franco-belge/','Must redirect to actual homepage, never missing route');let restored;vm.runInNewContext(restore,{URL,URLSearchParams,window:{location:landing,history:{replaceState:(_a,_b,value)=>restored=value}}});assert.equal(restored,expected);console.log('PASS',expected)}
console.log('Six routing regressions pass.');
