/**
 * Suchbereiche: welche Anfrage in welchem Teil des Exokortex sucht.
 *
 * Ohne Bereich ist der Exokortex ein Heuhaufen aus 250.000 Stellen über ein
 * Dutzend Projekte — eine Frage nach „Actors“ findet dann Provinzen-Material
 * genauso wie die Apify-Entscheidung. Ein Bereich bindet Stichwörter und
 * Arbeitsordner an Projekte. Frühere Chats sind immer dabei: dort steht, was
 * besprochen und entschieden wurde.
 */

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
  { id: 'chats', name: 'Frühere Chats', projekte: ['proj_cortex_chats'], stichwoerter: [], immer: true },
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
  return gut.length > 0 ? gut : STANDARD_BEREICHE;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
