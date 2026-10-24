#!/usr/bin/env python3
"""Recover the MicroK8s dqlite watch stall tracked in canonical/k8s-dqlite#364.
No database data is modified. A CAS lease serializes repairs across all nodes.
Remove this mitigation after upgrading to a release containing upstream PR #365.
"""
import datetime, json, os, select, socket, subprocess, sys, time
NODE=socket.gethostname().lower()
NAME='m321-watch-health-'+NODE
K=['/snap/bin/microk8s','kubectl','--request-timeout=12s']
def run(args, obj=None, timeout=18):
 return subprocess.run(K+args,input=json.dumps(obj) if obj else None,text=True,capture_output=True,timeout=timeout)
def utc(): return datetime.datetime.now(datetime.timezone.utc)
def stamp():return utc().isoformat().replace('+00:00','Z')
def probe():
 r=run(['get','configmap',NAME,'-n','kube-system','-o','json'])
 if r.returncode:
  r=run(['create','-f','-'],{'apiVersion':'v1','kind':'ConfigMap','metadata':{'name':NAME,'namespace':'kube-system'},'data':{'probe':'initial'}})
  if r.returncode:return False
  r=run(['get','configmap',NAME,'-n','kube-system','-o','json'])
 obj=json.loads(r.stdout); nonce=str(time.time_ns())
 p=subprocess.Popen(K+['get','--raw','/api/v1/namespaces/kube-system/configmaps?watch=1&fieldSelector=metadata.name%3D'+NAME+'&resourceVersion='+obj['metadata']['resourceVersion']+'&timeoutSeconds=10'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 try:
  time.sleep(.5)
  r=run(['patch','configmap',NAME,'-n','kube-system','--type=merge','-p',json.dumps({'data':{'probe':nonce}})])
  if r.returncode:return False
  end=time.monotonic()+8; seen=b''
  while time.monotonic()<end:
   if select.select([p.stdout],[],[],max(0,end-time.monotonic()))[0]:
    part=os.read(p.stdout.fileno(),4096)
    if not part:break
    seen+=part
    if nonce.encode() in seen:return True
  return False
 finally:
  p.kill();p.wait()
def lock():
 r=run(['get','lease','m321-watch-recovery','-n','kube-system','-o','json'])
 if r.returncode:
  obj={'apiVersion':'coordination.k8s.io/v1','kind':'Lease','metadata':{'name':'m321-watch-recovery','namespace':'kube-system'},'spec':{}}
  action='create'
 else:obj=json.loads(r.stdout);action='replace'
 spec=obj.get('spec',{}); last=spec.get('renewTime')
 if last and spec.get('holderIdentity') and (utc()-datetime.datetime.fromisoformat(last.replace('Z','+00:00'))).total_seconds()<90:return False
 obj['spec']={'holderIdentity':NODE,'leaseDurationSeconds':90,'renewTime':stamp()}
 return run([action,'-f','-'],obj).returncode==0

def main():
 if probe():
  if '--check' in sys.argv:print(NODE+': watch healthy')
  return
 print(NODE+': watch did not deliver a new event',flush=True)
 if '--check' in sys.argv:raise SystemExit(2)
 if not lock():print('Another node holds recovery lease; deferred',flush=True);return
 print('Restarting local dqlite to recover watch delivery',flush=True)
 subprocess.run(['systemctl','restart','snap.microk8s.daemon-k8s-dqlite'],check=True,timeout=35)
 time.sleep(3)
 subprocess.run(['systemctl','restart','snap.microk8s.daemon-kubelite'],check=True,timeout=25)
 for attempt in range(6):
  time.sleep(3)
  if run(['get','--raw','/readyz']).returncode==0:break
 if not probe():raise RuntimeError('Watch still unhealthy after dqlite restart')
 print(NODE+': watch recovered',flush=True)
 # Release only after this node is healthy, allowing the next node to repair.
 r=run(['get','lease','m321-watch-recovery','-n','kube-system','-o','json'])
 if r.returncode==0:
  obj=json.loads(r.stdout)
  if obj.get('spec',{}).get('holderIdentity')==NODE:
   obj['spec']['holderIdentity']='';run(['replace','-f','-'],obj)
if __name__=='__main__':
 try:main()
 except (subprocess.TimeoutExpired, ValueError, RuntimeError) as exc:
  print(type(exc).__name__+': '+str(exc),file=sys.stderr);sys.exit(1)

