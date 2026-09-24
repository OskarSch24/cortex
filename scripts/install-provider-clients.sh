#!/usr/bin/env bash
# Official clients scoped to Cortex. No global shell/profile modifications.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$HOME/.cortex/runtime"
mkdir -p "$RUNTIME/bin"
npm install --prefix "$RUNTIME/claude" @anthropic-ai/claude-code@2.1.280
python3 - "$RUNTIME" <<'PY'
import sys, pathlib, platform, re, urllib.request, gzip, subprocess
runtime=pathlib.Path(sys.argv[1]); base='https://x.ai/cli'
osname={'Darwin':'macos','Linux':'linux'}[platform.system()]
arch={'arm64':'aarch64','aarch64':'aarch64','x86_64':'x86_64'}[platform.machine()]
version=urllib.request.urlopen(base+'/stable').read().decode().strip()
assert re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9._]+)?',version)
url=f'{base}/grok-{version}-{osname}-{arch}'
tmp=runtime/'bin/grok.download'
try: tmp.write_bytes(gzip.decompress(urllib.request.urlopen(url+'.gz').read()))
except Exception: urllib.request.urlretrieve(url,tmp)
tmp.chmod(0o755)
subprocess.run([str(tmp),'--version'],check=True,timeout=20)
tmp.replace(runtime/'bin/grok')
PY
