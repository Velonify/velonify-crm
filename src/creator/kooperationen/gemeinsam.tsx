import { useCallback, useEffect, useState } from 'react';
import { useCreatorApi } from '../api';
export const PHASEN = ['anfrage', 'verhandlung', 'vertrag', 'briefing', 'umsetzung', 'freigabe', 'reporting', 'rechnung'] as const;
export const LABEL: Record<string, string> = { anfrage: 'Anfrage', verhandlung: 'Verhandlung', vertrag: 'Vertrag', briefing: 'Briefing', umsetzung: 'Umsetzung', freigabe: 'Freigabe', reporting: 'Reporting', rechnung: 'Rechnung', abgeschlossen: 'Abgeschlossen', abgesagt: 'Abgesagt', offen: 'Offen', rechnung_gestellt: 'Rechnung gestellt', bezahlt: 'Bezahlt' };
export const KANAELE = ['tiktok', 'instagram', 'youtube', 'twitch'];
export const geld = (v: number | null | undefined, w = 'EUR') => v === null || v === undefined ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: w }).format(v);
export function useDaten<T>(pfad: string) {
  const api = useCreatorApi();
  const [daten, setDaten] = useState<T>();
  const [fehler, setFehler] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const laden = useCallback(async () => {
    setFehler(undefined);
    try { setDaten(await api.get<T>(pfad)); } catch (e) { setFehler(e); }
  }, [api, pfad]);
  useEffect(() => { void laden(); }, [laden]);
  const speichern = async (route: string, body: unknown) => {
    setBusy(true); setFehler(undefined);
    try { const result = await api.post(route, body); await laden(); return result; }
    catch (e) { setFehler(e); return undefined; }
    finally { setBusy(false); }
  };
  return { api, daten, fehler, setFehler, busy, laden, speichern };
}
