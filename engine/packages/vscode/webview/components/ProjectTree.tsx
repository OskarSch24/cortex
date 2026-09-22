import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConversationMeta, ProjectDto } from '../../src/panel/protocol.js';
import { Glyph } from './CortexIcons.js';

/**
 * Der Projektbaum der Seitenleiste.
 *
 * Ein Projekt zeigt seinen Zustand am Ordner selbst — geschlossen oder mit
 * aufgeklappter Lasche. Ein zweiter Pfeil daneben wäre dieselbe Aussage
 * doppelt. Das Aufklappen schiebt die darunter liegenden Projekte weg, statt
 * sich über sie zu legen: die Liste bleibt eine Liste, nur länger.
 *
 * Die Höhe wird über `grid-template-rows: 0fr → 1fr` animiert. Das misst nichts
 * und braucht kein `scrollHeight`, deshalb stimmt es auch dann, wenn eine
 * Aufgabe hinzukommt, während die Gruppe gerade auffährt.
 */

export interface ProjectTreeProps {
  projects: ProjectDto[];
  conversations: ConversationMeta[];
  activeId: string;
  activePath?: string;
  open: string[];
  onToggle: (path: string) => void;
  onOpenTask: (id: string) => void;
  onNewTask: (path: string) => void;
  onDeleteTask: (id: string) => void;
  onEditProject: (project: ProjectDto) => void;
  onPinProject: (project: ProjectDto) => void;
  /** Blendet ein Projekt aus der Leiste aus — oder holt es zurück. */
  onArchiveProject: (project: ProjectDto) => void;
}

export function ProjectTree({ projects, ...rest }: ProjectTreeProps) {
  const pinned = projects.filter(p => p.pinned);
  const loose = projects.filter(p => !p.pinned);
  return <>
    {pinned.length > 0 && <Section label="Angeheftet" list={pinned} {...rest} />}
    {loose.length > 0 && <Section label="Projekte" list={loose} {...rest} />}
  </>;
}

type NodeProps = Omit<ProjectTreeProps, 'projects'>;

/**
 * Archivierte Projekte, direkt über der Kontozeile.
 *
 * Archivieren ist reine Ordnung in der Leiste: Ordner, Aufgaben und laufende
 * Agenten bleiben, wie sie sind — das Projekt steht nur nicht mehr unter
 * „Projekte“. Das Feld klappt nach oben auf und nimmt dem Baum darüber Platz,
 * statt sich über ihn zu legen; drinnen verhalten sich die Projekte wie oben.
 */
export function ArchivedProjects({ projects, expanded, onExpand, ...rest }: ProjectTreeProps & { expanded: boolean; onExpand: () => void }) {
  return <section class={`cx-archive ${expanded ? 'open' : ''}`} aria-label="Archivierte Projekte">
    <button class="cx-archive-toggle" aria-expanded={expanded} onClick={onExpand}>
      <Glyph name="archive" size={15} />
      <span>Archivierte Projekte</span>
      {projects.length > 0 && <span class="cx-count">{projects.length}</span>}
      <span class="cx-archive-chevron"><Glyph name="chevron" size={12} /></span>
    </button>
    <div class="cx-tree-children cx-archive-body" aria-hidden={!expanded}>
      <div>
        <div class="cx-tree-children-inner">
          {projects.map(project => <ProjectNode key={project.path} project={project} archived reachable={expanded} {...rest} />)}
          {!projects.length && <p class="cx-archive-empty">Noch nichts archiviert. Im Kärtchen eines Projekts lässt es sich wegstellen.</p>}
        </div>
      </div>
    </div>
  </section>;
}

function Section({ label, list, ...props }: NodeProps & { label: string; list: ProjectDto[] }) {
  return <section class="cx-tree-section" aria-label={label}>
    <h2 class="cx-tree-heading">{label}</h2>
    {list.map(project => <ProjectNode key={project.path} project={project} {...props} />)}
  </section>;
}

function ProjectNode({ project, archived = false, reachable = true, ...props }: NodeProps & { project: ProjectDto; archived?: boolean; reachable?: boolean }) {
  const tasks = props.conversations.filter(c => c.projectPath === project.path);
  const open = props.open.includes(project.path);
  // Im zugeklappten Archiv sind die Zeilen noch im Baum, aber nicht zu sehen.
  const tab = reachable ? 0 : -1;
  const taskTab = open && reachable ? 0 : -1;
  const current = project.path === props.activePath;
  const [menu, setMenu] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const [menuLeft, setMenuLeft] = useState<number>();
  const row = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout>>();
  // Das Kärtchen erscheint erst, wenn der Zeiger wirklich stehen bleibt. Sonst
  // flackert es bei jedem Weg quer über die Liste einmal pro Zeile auf.
  const show = () => {
    clearTimeout(hold.current);
    hold.current = setTimeout(() => {
      const box = row.current?.getBoundingClientRect();
      if (box) {
        setMenuTop(Math.min(box.top, window.innerHeight - 190));
        // Rechts neben die Zeile, nicht an eine feste Stelle: dort lag das
        // Kärtchen über dem Stift, sobald die Leiste breiter war als 254 px.
        setMenuLeft(box.right + 8);
      }
      setMenu(true);
    }, 420);
  };
  const hide = () => { clearTimeout(hold.current); hold.current = setTimeout(() => setMenu(false), 140); };
  useEffect(() => () => clearTimeout(hold.current), []);

  return <div class={`cx-tree-node ${open ? 'open' : ''} ${project.missing ? 'missing' : ''}`}>
    <div ref={row} class={`cx-tree-row ${current ? 'current' : ''} ${menu ? 'held' : ''}`} onMouseEnter={show} onMouseLeave={hide}>
      <button class="cx-tree-open" title={project.path} aria-expanded={open} tabIndex={tab} onClick={() => props.onToggle(project.path)}>
        <Glyph name={open ? 'folderOpen' : 'folder'} size={15} />
        <span>{project.name}</span>
      </button>
      {/* Erst die Aktion, dann „Mehr“: der Stift liegt nie unter dem Kärtchen. */}
      {archived
        ? <button class="cx-icon cx-tree-act" aria-label={`${project.name} aus dem Archiv holen`} title="Aus dem Archiv holen" tabIndex={tab} onClick={() => { clearTimeout(hold.current); setMenu(false); props.onArchiveProject(project); }}><Glyph name="unarchive" size={14} /></button>
        : <button class="cx-icon cx-tree-act" aria-label={`Neue Aufgabe in ${project.name}`} tabIndex={tab} onClick={() => { clearTimeout(hold.current); setMenu(false); props.onNewTask(project.path); }}><Glyph name="compose" size={14} /></button>}
      <button class="cx-icon cx-tree-act" aria-label={`Mehr zu ${project.name}`} tabIndex={tab} onClick={() => { clearTimeout(hold.current); props.onEditProject(project); }}><Glyph name="dots" size={15} /></button>
    </div>

    {menu && <div class="cx-tree-card" style={{ top: menuTop, ...(menuLeft !== undefined ? { left: menuLeft } : {}) }} onMouseEnter={show} onMouseLeave={hide}>
      <div class="cx-tree-card-head">
        <Glyph name={open ? 'folderOpen' : 'folder'} size={15} />
        <strong>{project.name}</strong>
        {!archived && <button class="cx-icon" aria-label={project.pinned ? 'Nicht mehr anheften' : 'Anheften'} title={project.pinned ? 'Nicht mehr anheften' : 'Anheften'} aria-pressed={project.pinned} onClick={() => { setMenu(false); props.onPinProject(project); }}><Glyph name="pin" size={14} /></button>}
        <button class="cx-icon" aria-label={archived ? 'Aus dem Archiv holen' : 'Archivieren'} title={archived ? 'Aus dem Archiv holen' : 'Archivieren — nur aus der Leiste, nichts wird geschlossen'} onClick={() => { setMenu(false); props.onArchiveProject(project); }}><Glyph name={archived ? 'unarchive' : 'archive'} size={14} /></button>
      </div>
      <p class="cx-tree-card-count"><Glyph name="chat" size={13} />{tasks.length === 1 ? '1 Aufgabe' : `${tasks.length} Aufgaben`}</p>
      <p class="cx-tree-card-path"><Glyph name="folder" size={14} /><span>{(project.folders?.length ? project.folders : [project.path]).map(f => short(f)).join(' · ')}</span></p>
      <button class="cx-tree-card-edit" onClick={() => { setMenu(false); props.onEditProject(project); }}><Glyph name="gear" size={14} />Projekt bearbeiten</button>
    </div>}

    <div class="cx-tree-children" aria-hidden={!open}>
      <div>
        <div class="cx-tree-children-inner">
          {tasks.map(task => <div key={task.id} class={`cx-tree-task ${props.activeId === task.id ? 'active' : ''}`}>
            <button class="cx-tree-task-open" title={task.title} onClick={() => props.onOpenTask(task.id)} tabIndex={taskTab}>
              <span>{task.title === 'New chat' || !task.title ? 'Neue Aufgabe' : task.title}</span>
            </button>
            {task.running
              ? <span class="cx-tree-task-run" title="Läuft"><span class="cx-dot" /></span>
              : <button class="cx-icon cx-tree-task-del" aria-label={`Aufgabe löschen: ${task.title}`} tabIndex={taskTab} onClick={() => props.onDeleteTask(task.id)}><Glyph name="trash" size={12} /></button>}
          </div>)}
          {!tasks.length && <button class="cx-tree-empty" tabIndex={taskTab} onClick={() => props.onNewTask(project.path)}>Erste Aufgabe starten</button>}
        </div>
      </div>
    </div>
  </div>;
}

/** Der Heimatpfad ist auf diesem Mac immer derselbe — er kostet nur Breite. */
function short(path: string) {
  const home = /^\/Users\/[^/]+/.exec(path);
  return home ? '~' + path.slice(home[0].length) : path;
}
