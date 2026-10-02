import { useBranchenNachtrag, useLeadFinderApi } from '../leads/useLeadFinder';

/** Button that fills missing industries of CRM firms, with its progress; hidden when nothing is missing. */
export function BranchenNachtrag() {
  const api = useLeadFinderApi();
  const { stand, offen, starte } = useBranchenNachtrag(api);
  if (!api) return null;
  if (stand.laeuft) return <span>Branchen werden ergänzt: {stand.erledigt.toLocaleString('de-DE')} von {stand.gesamt.toLocaleString('de-DE')} Firmen …</span>;
  return (
    <>
      {stand.fehler && <span className="warn-text">Ergänzen abgebrochen: {stand.fehler}</span>}
      {!stand.fehler && stand.gesamt > 0 && <span>{stand.ergaenzt.toLocaleString('de-DE')} Firmen haben eine Branche bekommen.</span>}
      {offen > 0 && (
        <button type="button" className="link-button small" onClick={() => void starte()} title="Bekannte Branchen aus dem Lead-Finder übernehmen, die übrigen ordnet Claude anhand der Startseite ein. Von Hand gewählte Branchen bleiben.">
          Branche für {offen.toLocaleString('de-DE')} {offen === 1 ? 'Firma' : 'Firmen'} ergänzen
        </button>
      )}
    </>
  );
}
