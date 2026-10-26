#!/usr/bin/env python3
"""Testet Naimas einzelnen Compose-Service inkl. Wiederanlauf und Persistenz.

Auf Naimas VM: python3 scripts/category-vm-test.py
Erzeugt nur Kategorien unter zwei zufälligen Test-UUIDs. Keine echten Konten.
Stoppt/startet ausschliesslich Container des Compose-Projekts category-service.
Dies ist KEIN Nachweis für einen vollständigen VM-Ausfall.
"""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get('CATEGORY_BASE_URL', 'http://127.0.0.1:8083').rstrip('/')
APP = 'category-service-category-service-1'
DB = 'category-service-db-1'

def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, timeout=35).strip()

def inspect(name):
    return json.loads(docker('inspect', name))[0]

def request(method, path, token=None, body=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
        data=None if body is None else json.dumps(body).encode())
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None

def wait_ready(restarts=None):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            if (restarts is None or inspect(APP)['RestartCount'] > restarts) and request('GET', '/health')[0] == 200:
                return
        except (OSError, subprocess.SubprocessError):
            pass
        time.sleep(0.3)
    raise TimeoutError('Kategorien-Service wurde nicht innerhalb von 60 s bereit')

def make_token(secret, user):
    def b64(value):
        return base64.urlsafe_b64encode(value).rstrip(b'=')
    head = b64(b'{"alg":"HS256","typ":"JWT"}')
    payload = b64(json.dumps({'sub': user, 'iss': 'user-service', 'exp': int(time.time()) + 600}).encode())
    data = head + b'.' + payload
    return (data + b'.' + b64(hmac.new(secret.encode(), data, hashlib.sha256).digest())).decode()

def main():
    # Preflight vor dem ersten Eingriff. Keine fremden oder vorher gestoppten Dienste starten.
    for name in (APP, DB):
        obj = inspect(name)
        assert obj['Config']['Labels'].get('com.docker.compose.project') == 'category-service'
        assert obj['State']['Running'], name + ' ist vor Testbeginn gestoppt'
    env = dict(item.split('=', 1) for item in inspect(APP)['Config']['Env'])
    token = make_token(env['JWT_SECRET'], str(uuid.uuid4()))
    other = make_token(env['JWT_SECRET'], str(uuid.uuid4()))
    results = []
    def ok(name, detail):
        results.append({'test': name, 'status': 'PASS', 'detail': detail})
    try:
        assert request('GET', '/categories')[0] == 401
        assert request('POST', '/categories', token, {'name': ' '})[0] == 400
        assert request('POST', '/categories', token, {'name': 'Test', 'color': 'rot'})[0] == 400
        ok('CAT-01', 'Anmeldung und Eingabevalidierung')
        code, cat = request('POST', '/categories', token, {'name': 'Audit', 'color': '#FF8800'})
        assert code == 201 and cat['color'] == '#ff8800'
        path = '/categories/' + cat['id']
        assert request('POST', '/categories', token, {'name': 'audit'})[0] == 409
        assert request('GET', path, token)[0] == 200
        ok('CAT-02', 'Erstellen, Lesen, Farbe, doppelte Namen')
        for method, body in [('GET', None), ('PATCH', {'name': 'Fremd'}), ('DELETE', None)]:
            assert request(method, path, other, body)[0] == 404
        assert request('GET', '/categories', other) == (200, [])
        ok('CAT-03', 'Fremdzugriff auf Lesen/Aendern/Loeschen abgewehrt')
        assert request('PATCH', path, token, {'name': 'Persistenz'})[0] == 200
        before = inspect(APP)['RestartCount']
        start = time.monotonic()
        subprocess.run(['docker', 'exec', APP, 'sh', '-c', 'kill -9 $(pgrep -f "^node src/server.js$")'], timeout=10, check=False, capture_output=True)
        wait_ready(before)
        assert request('GET', path, token)[1]['name'] == 'Persistenz'
        ok('CAT-04', f'Prozessabsturz: RestartCount gestiegen; nach {time.monotonic()-start:.2f} s bereit; Daten vorhanden')
        start = time.monotonic()
        docker('restart', DB)
        wait_ready()
        assert request('GET', path, token)[1]['name'] == 'Persistenz'
        ok('CAT-05', f'Datenbank-Neustart: nach {time.monotonic()-start:.2f} s bereit; gleiche Kategorie vorhanden')
        assert request('DELETE', path, token)[0] == 204
        assert request('GET', path, token)[0] == 404
        assert request('GET', '/categories', token) == (200, [])
        assert request('GET', '/categories?includeDeleted=true', token)[1][0]['deletedAt']
        assert request('POST', '/categories', token, {'name': 'Persistenz'})[0] == 201
        ok('CAT-06', 'Soft-Delete, geloeschte Kategorie sichtbar, Name wiederverwendbar')
    finally:
        docker('start', DB, APP)
        wait_ready()
        assert request('DELETE', '/categories', token)[0] == 204
        assert request('DELETE', '/categories', other)[0] == 204
        print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    assert len(results) == 6
    print('PASS: 6/6, Testdaten bereinigt, Service und Datenbank bereit')

if __name__ == '__main__':
    main()
