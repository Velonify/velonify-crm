import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCrm } from '../data/CrmContext';
import { istMitarbeiter, NUR_GRUENDER_WERKZEUGE } from '../data/rollen';
import { instanzModus } from '../config';
import { useMandant } from '../plattform/MandantContext';

/**
 * The signed-in person's role: employees see no money (src/data/rollen.ts). `erlaubt` replaces useMandant().erlaubt
 * wherever tools are listed. crm-api enforces the same, this only keeps the hub from offering what would fail.
 */
export function useRolle(): { mitarbeiter: boolean; siehtGeld: boolean; erlaubt(werkzeug: string): boolean } {
  const { userEmail } = useAuth();
  const { db } = useCrm();
  const { erlaubt: mandantErlaubt, instanz } = useMandant();
  // In an own instance the role comes from crm-api: "schnitt" works without amounts like Velonify's employees.
  const mitarbeiter = instanzModus ? instanz?.rolle === 'schnitt' : istMitarbeiter(db?.einstellungen, userEmail());
  const erlaubt = useCallback(
    (werkzeug: string) => mandantErlaubt(werkzeug) && !(mitarbeiter && NUR_GRUENDER_WERKZEUGE.includes(werkzeug)),
    [mandantErlaubt, mitarbeiter],
  );
  return { mitarbeiter, siehtGeld: !mitarbeiter, erlaubt };
}
