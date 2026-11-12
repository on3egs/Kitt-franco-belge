"""Create the public, deterministic Windows download from reviewed sources."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[2]
source=root/'tools/ethernet-direct'
out=root/'client/public/downloads/ethernet-direct-1.0.0.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for name in ['Ethernet-Direct.ps1','Lancer.cmd','LISEZ-MOI.txt','LICENSE.txt']:
  data=(source/name).read_bytes()
  if name.endswith('.cmd'): data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
  info=zipfile.ZipInfo('Ethernet-Direct/'+name,(2026,11,12,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,data)
sha=hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.sha256').write_text(sha+'  '+out.name+'\n')
(root/'client/public/ethernet-direct/release.json').write_text(json.dumps({'version':'1.0.0','file':'/downloads/'+out.name,'sha256':sha,'bytes':out.stat().st_size},indent=2)+'\n')
print(out.name, out.stat().st_size, 'bytes; SHA-256',sha)
