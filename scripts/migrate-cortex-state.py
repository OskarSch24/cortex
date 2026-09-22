"""Copy legacy public extension metadata, leaving credentials and profile paths intact.
Run only after Cortex has closed. Originals and a SQLite backup are retained.
"""
import json, sqlite3, sys, time, shutil
from pathlib import Path
base=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Library/Application Support/Cortex/User'
legacy_prefix='usturlab.'
def keys(value):
    if isinstance(value,dict): return {(('cortex.'+k[len(legacy_prefix):]) if k.startswith(legacy_prefix) else k):keys(v) for k,v in value.items()}
    if isinstance(value,list):return [keys(v) for v in value]
    return value
for db in [base/'globalStorage/state.vscdb', *base.glob('workspaceStorage/*/state.vscdb')]:
    if not db.exists():continue
    connection=sqlite3.connect(db)
    old=connection.execute("select value from ItemTable where key='oskarschiermeister.kortex'").fetchone()
    current=connection.execute("select value from ItemTable where key='oskarschiermeister.cortex'").fetchone()
    if not old: connection.close();continue
    merged={**keys(json.loads(old[0])), **(json.loads(current[0]) if current else {})}
    if current and json.loads(current[0])==merged:connection.close();continue
    backup=sqlite3.connect(str(db)+'.before-cortex-'+str(int(time.time())))
    connection.backup(backup);backup.close()
    connection.execute("insert or replace into ItemTable(key,value) values(?,?)",('oskarschiermeister.cortex',json.dumps(merged)))
    connection.commit();connection.close()
    print('Preserved Cortex extension metadata:',db.parent.name)
settings=base/'settings.json'
if settings.exists():
    # VS Code settings can contain comments; retain their text and only rename exact setting keys.
    import re
    old=settings.read_text()
    new=re.sub(r'"usturlab\.([^"\n]+)"\s*:',r'"cortex.\1":',old)
    if old!=new:shutil.copy2(settings,str(settings)+'.before-cortex');settings.write_text(new)
