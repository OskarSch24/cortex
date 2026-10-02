/**
 * Suchbereiche: welche Anfrage in welchem Teil des Exokortex sucht.
 *
 * Ohne Bereich ist der Exokortex ein Heuhaufen aus 250.000 Stellen über ein
 * Dutzend Projekte — eine Frage nach „Actors“ findet dann Provinzen-Material
 * genauso wie die Apify-Entscheidung. Ein Bereich bindet Stichwörter und
 * Arbeitsordner an Projekte. Frühere Chats sind immer dabei: dort steht, was
 * besprochen und entschieden wurde.
 */

/**
 * Die Chat-Ablagen im Exokortex: Cortex' eigene und die aus Claude Code,
 * Codex und den Datenexporten (`bruecke/ki_chats.py`, Ordner ~/KI-Chats).
 */
export const CHAT_PROJEKTE = ['proj_cortex_chats', 'proj_ki_chats'] as const;

export interface Suchbereich {
  id: string;
  name: string;
  /** Projektkennungen im Exokortex (`proj_…`). */
  projekte: string[];
  /** Kleinschreibung egal; ein Treffer im Prompt schaltet den Bereich zu. */
  stichwoerter: string[];
  /**
   * Wörter, die auch in fremden Zusammenhängen fallen („Architektur“,
   * „Workflow“). Eines allein reicht nicht — erst zwei davon, oder eines
   * zusammen mit einem eindeutigen Stichwort, schalten den Bereich zu.
   */
  allgemein?: string[];
  /** Ein Arbeitsordner, dessen Pfad einen dieser Teile enthält, schaltet ihn ebenfalls zu. */
  ordner?: string[];
  /** Gilt für jede Anfrage. */
  immer?: boolean;
}

export const STANDARD_BEREICHE: Suchbereich[] = [
  { id: 'chats', name: 'Frühere Chats', projekte: [...CHAT_PROJEKTE], stichwoerter: [], immer: true },
  {
    id: 'nordwind',
    name: 'Nordwind Studio',
    projekte: ['proj_nordwind'],
    stichwoerter: [
      'nordwind', 'nordwind studio', 'phase x', 'phase 0', 'phase 1', 'phase 2', 'phase 3', 'phase 4', 'phase 5',
      'apify', 'einsammler', 'werkbank', 'hetzner', 'verner', 'skool', 'fertility', 'crega',
    ],
    allgemein: ['actor', 'ernte', 'workflow', 'vektor', 'algorithm', 'frames', 'clips', 'intelligence', 'publisher'],
    ordner: ['Nordwind Studio', 'Nordwind'],
  },
  {
    id: 'anatomy',
    name: 'Anatomy Academy',
    projekte: ['proj_anatomy_academy'],
    stichwoerter: ['anatomy', 'anatomie'],
    allgemein: ['academy'],
    ordner: ['Anatomy-Academy', 'Anatomy Academy'],
  },
  {
    id: 'dummy-economics',
    name: 'Dummy Economics',
    projekte: ['proj_dummy_economics'],
    stichwoerter: ['dummy economics'],
    allgemein: ['ökonomie', 'volkswirtschaft'],
    ordner: ['Dummy Economics'],
  },
  { id: 'provinzen', name: 'Provinzen', projekte: ['proj_provinzen'], stichwoerter: ['provinz', 'provinzen'] },
  { id: 'educore', name: 'Educore', projekte: ['proj_educore'], stichwoerter: ['educore'] },
  {
    id: 'architektur',
    name: 'New German Architecture',
    projekte: ['proj_new_german_architecture'],
    stichwoerter: ['new german architecture'],
    allgemein: ['architektur'],
  },
  { id: 'gods-eye', name: "God's Eye View", projekte: ['proj_gods_eye_view'], stichwoerter: ["god's eye", 'gods eye'] },
  { id: 'monaco', name: 'Monaco', projekte: ['proj_monaco'], stichwoerter: ['monaco'] },
  { id: 'super-suit', name: 'Super Suit', projekte: ['proj_super_suit'], stichwoerter: ['super suit', 'supersuit'] },
  { id: 'mobil', name: 'Mobil und klar', projekte: ['proj_mobil_und_klar'], stichwoerter: ['mobil und klar'] },
  {
    id: 'theologie',
    name: 'Theologische Lehre',
    projekte: ['proj_theologische_lehre'],
    stichwoerter: ['theologie', 'theologisch'],
  },
];

/** Was eine Anfrage durchsuchen darf, und warum. */
export interface Auswahl {
  projekte: string[];
  bereiche: string[];
}

/**
 * Die Bereiche einer Anfrage. Ein Stichwort zählt nur als ganzes Wort (oder
 * Wortfolge): „actor“ trifft „Actors“ und „Actor-Liste“, aber nicht „factory“.
 *
 * Ein Bereich kommt dazu, wenn sein Name fällt, ein eindeutiges Stichwort
 * fällt, der Arbeitsordner zu ihm gehört — oder mindestens zwei seiner
 * allgemeinen Wörter fallen. Ein einzelnes „Architektur“ in einem Chat über
 * Bilanzen holte sonst ein ganzes fremdes Projekt in die Erinnerung.
 */
export function waehleBereiche(prompt: string, cwd: string | undefined, bereiche: Suchbereich[]): Auswahl {
  const text = ` ${prompt.toLowerCase()} `;
  const projekte = new Set<string>();
  const namen: string[] = [];
  for (const b of bereiche) {
    const faellt = (w: string) => !!w.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w.trim().toLowerCase())}`, 'u').test(text);
    const allgemein = (b.allgemein ?? []).filter(faellt).length;
    const trifft =
      b.immer ||
      faellt(b.name) ||
      b.stichwoerter.some(faellt) ||
      allgemein >= 2 ||
      (!!cwd && (b.ordner ?? []).some((o) => o && cwd.toLowerCase().includes(o.toLowerCase())));
    if (!trifft) continue;
    namen.push(b.name);
    for (const p of b.projekte) if (p.trim()) projekte.add(p.trim());
  }
  return { projekte: [...projekte], bereiche: namen };
}

/** Wozu ein Chat in einem Projekt gehört, und was er darüber hinaus nennen darf. */
export interface ProjektRahmen {
  /** Der Projektordner des Chats. */
  ordner: string;
  /** Bereiche, zu denen der Ordner gehört. */
  heimat: Suchbereich[];
  /** Andere Bereiche, die die Nachricht oder der Zettel ausdrücklich nennt. */
  genannt: Suchbereich[];
  /** Stammt ein früherer Chat aus diesem Ordner (`projekt_pfad`), gehört er dazu? */
  gehoertDazu: (chatOrdner: string) => boolean;
  /** Was der Abruf durchsuchen darf: die immer gesuchten Bereiche, Heimat und Genanntes. */
  projekte: string[];
  /** Die Vorgabe für das Modell, als Brief-Abschnitt. */
  anweisung: string;
}

/**
 * Der Rahmen eines Chats, der in einem Projekt läuft. Heimat ist der Bereich
 * des Ordners; ein fremder Bereich zählt nur, wenn sein Name oder ein
 * Stichwort fällt — der Arbeitsordner allein holt keinen.
 */
export function projektRahmen(ordner: string, text: string, bereiche: Suchbereich[]): ProjektRahmen {
  const pfad = normalisiere(ordner);
  const imOrdner = (b: Suchbereich) => (b.ordner ?? []).some((o) => !!o.trim() && pfad.toLowerCase().includes(o.trim().toLowerCase()));
  const heimat = bereiche.filter((b) => !b.immer && imOrdner(b));
  // Innerhalb eines Projekts zählt nur ein Name oder eindeutiges Stichwort —
  // zwei allgemeine Wörter („Workflow“, „Vektor“) holen kein fremdes Projekt.
  const eindeutig = bereiche.map((b) => ({ ...b, allgemein: [] }));
  const genanntNamen = new Set(waehleBereiche(text, undefined, eindeutig).bereiche);
  const genannt = bereiche.filter((b) => !b.immer && genanntNamen.has(b.name) && !heimat.includes(b));
  const erlaubteTeile = [...heimat, ...genannt].flatMap((b) => b.ordner ?? []).map((o) => o.trim().toLowerCase()).filter(Boolean);
  const gehoertDazu = (chatOrdner: string) => {
    const c = normalisiere(chatOrdner);
    return c === pfad || c.startsWith(`${pfad}/`) || erlaubteTeile.some((t) => c.toLowerCase().includes(t));
  };
  const name = pfad.split('/').pop() || pfad;
  const kennungen = heimat.flatMap((b) => b.projekte);
  const zeilen = [
    `Dieser Chat gehört zum Projekt im Ordner ${pfad}` +
      (heimat.length ? ` (im Exokortex: ${heimat.map((b) => b.name).join(', ')} — ${kennungen.join(', ')}).` : ` („${name}“).`),
    'Beziehe Fragen ohne ausdrückliche Projektangabe auf dieses Projekt: „die Scrapes“, „die Plattform“, „der Stand“ meinen die Dinge dieses Projekts.',
    kennungen.length
      ? `Suchst du selbst im Exokortex, schränke «suche» auf ${kennungen.map((k) => `projekt=${k}`).join(' oder ')} ein.`
      : 'Dieses Projekt hat im Exokortex keinen eigenen Bereich. Stütze dich zuerst auf den Projektordner.',
    genannt.length
      ? `Die Nachricht nennt ausdrücklich auch: ${genannt.map((b) => `${b.name} (${b.projekte.join(', ')})`).join(', ')} — dort darfst du ebenfalls suchen.`
      : 'Material und frühere Chats anderer Projekte gehören nicht in die Antwort. Findest du im Projekt nichts, sag das, statt auf ein anderes Projekt auszuweichen.',
  ];
  const projekte = [...new Set([...bereiche.filter((b) => b.immer), ...heimat, ...genannt].flatMap((b) => b.projekte).map((p) => p.trim()).filter(Boolean))];
  return { ordner: pfad, heimat, genannt, gehoertDazu, projekte, anweisung: zeilen.join('\n') };
}

function normalisiere(pfad: string): string {
  return pfad.trim().replace(/\/+$/, '');
}

/** Liest gespeicherte Bereiche; was nicht passt, fällt auf die Vorgabe zurück. */
export function leseBereiche(wert: unknown): Suchbereich[] {
  if (!Array.isArray(wert)) return STANDARD_BEREICHE;
  const gut = wert.filter(
    (b): b is Suchbereich =>
      !!b && typeof b === 'object' &&
      typeof (b as Suchbereich).id === 'string' &&
      typeof (b as Suchbereich).name === 'string' &&
      Array.isArray((b as Suchbereich).projekte) &&
      Array.isArray((b as Suchbereich).stichwoerter),
  );
  if (gut.length === 0) return STANDARD_BEREICHE;
  // Gespeicherte Einstellungen stammen oft aus der Zeit vor ~/KI-Chats.
  return gut.map((b) => (b.id === 'chats' ? { ...b, projekte: [...new Set([...b.projekte, ...CHAT_PROJEKTE])] } : b));
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
