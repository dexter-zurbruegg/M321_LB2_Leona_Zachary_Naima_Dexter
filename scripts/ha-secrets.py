#!/usr/bin/env python3
"""Load the shared HA credentials from a private .env; never print their values."""
import json
import subprocess
import sys
from pathlib import Path

values = {}
for line in Path(sys.argv[1] if len(sys.argv) > 1 else '.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
keys = ['JWT_SECRET', 'USER_DB_PASSWORD', 'TODO_DB_PASSWORD', 'CATEGORY_DB_PASSWORD']
if any(not values.get(key) for key in keys):
    raise SystemExit('Missing JWT_SECRET or database password in the supplied .env')

def apply(name, data, kind='Opaque'):
    obj = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {
        'name': name, 'namespace': 'todo-app', 'labels': {'cnpg.io/reload': 'true'}},
        'type': kind, 'stringData': data}
    subprocess.run(['microk8s', 'kubectl', 'apply', '-f', '-'],
                   input=json.dumps(obj), text=True, check=True)

apply('todo-app-secrets', {key: values[key] for key in keys})
for role, key in [('user_svc', keys[1]), ('todo_svc', keys[2]), ('category_svc', keys[3])]:
    apply(role.replace('_', '-'), {'username': role, 'password': values[key]},
          'kubernetes.io/basic-auth')
