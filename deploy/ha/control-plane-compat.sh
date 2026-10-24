#!/bin/sh
# Compatibility settings used with MicroK8s 1.35.6 on the four team VMs.
set -eu
sudo -n python3 - <<'PY'
from pathlib import Path
import shutil
p=Path('/var/snap/microk8s/current/args/kube-apiserver')
b=p.with_name('kube-apiserver.before-m321-ha-20261024')
if not b.exists(): shutil.copy2(p,b)
lines=p.read_text().splitlines()
for i,line in enumerate(lines):
    if line.startswith('--feature-gates='):
        gates=dict(item.split('=',1) for item in line.split('=',1)[1].split(','))
        gates['WatchList']='false'
        lines[i]='--feature-gates='+','.join(k+'='+v for k,v in gates.items())
        break
else:
    lines.append('--feature-gates=WatchList=false')
lines=[x for x in lines if not x.startswith('--watch-cache=')]
lines.append('--watch-cache=false')
p.write_text('\n'.join(lines)+'\n')
PY
sudo -n systemctl restart snap.microk8s.daemon-kubelite
for attempt in $(seq 1 20); do
  if microk8s kubectl get --raw /readyz --request-timeout=3s >/dev/null 2>&1; then
    echo 'API ready after WatchList correction'
    exit 0
  fi
  sleep 2
done
exit 1

