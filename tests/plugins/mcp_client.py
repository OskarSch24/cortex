"""Ein schlanker MCP-Client über stdio — derselbe Weg, den Claude, Codex und Grok gehen.

initialize → notifications/initialized → tools/list → tools/call. Kein Anbieter,
kein Modell: nur der Server und seine Antworten. Browser-Server werden immer
headless gestartet (AGENTS.md: keine Desktop-Browser in Tests).
"""
import json
import os
import select
import subprocess
import time

PROTOCOL = '2025-06-18'


class McpError(Exception):
    pass


class StdioServer:
    def __init__(self, command, args=None, env=None, cwd=None, start_timeout=180):
        full_env = dict(os.environ)
        full_env.update(env or {})
        self.proc = subprocess.Popen(
            [command, *(args or [])], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=full_env, cwd=cwd, bufsize=0,
        )
        self.next_id = 0
        self.buffer = b''
        self.stderr = b''
        self.info = self.request('initialize', {
            'protocolVersion': PROTOCOL, 'capabilities': {}, 'clientInfo': {'name': 'cortex-tests', 'version': '1'},
        }, timeout=start_timeout)
        self.notify('notifications/initialized')

    def _send(self, msg):
        self.proc.stdin.write((json.dumps(msg) + '\n').encode())
        self.proc.stdin.flush()

    def notify(self, method, params=None):
        self._send({'jsonrpc': '2.0', 'method': method, **({'params': params} if params is not None else {})})

    def request(self, method, params=None, timeout=60):
        self.next_id += 1
        rid = self.next_id
        self._send({'jsonrpc': '2.0', 'id': rid, 'method': method, 'params': params or {}})
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None and not self.buffer:
                self._drain_stderr()
                raise McpError(f'Prozess beendet (Code {self.proc.returncode}): {self.stderr[-600:].decode(errors="replace")}')
            ready, _, _ = select.select([self.proc.stdout, self.proc.stderr], [], [], 0.5)
            for stream in ready:
                chunk = os.read(stream.fileno(), 65536)
                if stream is self.proc.stderr:
                    self.stderr += chunk
                    continue
                self.buffer += chunk
            while b'\n' in self.buffer:
                line, self.buffer = self.buffer.split(b'\n', 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if msg.get('id') == rid and ('result' in msg or 'error' in msg):
                    if 'error' in msg:
                        raise McpError(json.dumps(msg['error'], ensure_ascii=False)[:600])
                    return msg['result']
                if 'method' in msg and 'id' in msg:  # Rückfrage des Servers (z. B. roots/list)
                    self._send({'jsonrpc': '2.0', 'id': msg['id'], 'result': {'roots': []} if msg['method'] == 'roots/list' else {}})
        raise McpError(f'Keine Antwort auf {method} in {timeout} s')

    def _drain_stderr(self):
        try:
            while True:
                ready, _, _ = select.select([self.proc.stderr], [], [], 0)
                if not ready:
                    break
                chunk = os.read(self.proc.stderr.fileno(), 65536)
                if not chunk:
                    break
                self.stderr += chunk
        except Exception:
            pass

    def tools(self):
        out, cursor = [], None
        for _ in range(10):
            res = self.request('tools/list', {'cursor': cursor} if cursor else {})
            out += res.get('tools', [])
            cursor = res.get('nextCursor')
            if not cursor:
                break
        return out

    def call(self, name, arguments=None, timeout=90):
        res = self.request('tools/call', {'name': name, 'arguments': arguments or {}}, timeout=timeout)
        text = ' '.join(c.get('text', '') for c in res.get('content', []) if c.get('type') == 'text')
        return {'isError': bool(res.get('isError')), 'text': text, 'raw': res}

    def close(self):
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()
