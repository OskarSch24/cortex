import type { ComponentChildren } from 'preact';

/**
 * Ein Abschnitt der Plugin-Seiten: Überschrift, wahlweise Zahl und Aktion
 * daneben. Die Detailseite legt ihren Inhalt in ein eigenes div (`wrap`), die
 * Übersicht stellt ihn direkt unter die Überschrift.
 */
export function PluginSection({
  title,
  count,
  actions,
  wrap,
  children,
}: {
  title: string;
  count?: number;
  actions?: ComponentChildren;
  wrap?: boolean;
  children: ComponentChildren;
}) {
  return (
    <section class="cx-plugin-section">
      <div class="cx-plugin-section-head">
        <h2>{title}</h2>
        {count !== undefined && <b>{count}</b>}
        {actions}
      </div>
      {wrap ? <div>{children}</div> : children}
    </section>
  );
}
