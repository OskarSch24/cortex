"""Handshake und Status der OmniGrab-Brücke — kein Download, kein Guthaben."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mcp_client import StdioServer

MCP = Path.home() / 'dev/omnimedia-downloader/engine/omnigrab-mcp.py'

server = StdioServer('/usr/bin/python3', [str(MCP)], start_timeout=20)
try:
    info = server.info
    assert info.get('serverInfo', {}).get('name') == 'omnigrab', info
    tools = {t['name'] for t in server.tools()}
    assert tools == {'omnigrab_status', 'omnigrab_download', 'omnigrab_progress'}, tools
    status = server.call('omnigrab_status')
    assert not status['isError'], status['text']
    assert '"status": "ok"' in status['text'] or '"status":"ok"' in status['text'], status['text']
    print('OmniGrab-MCP: initialize, tools/list, status ok.')
finally:
    server.close()
