import { ImBau } from '../ImBau';

/**
 * Legal pages of the instance, public (needed for Google, Meta and TikTok app reviews): privacy policy, legal notice and
 * terms of use, filled from the instance's settings. Built by the module Steuerung/Home/Recht.
 */
export function DatenschutzSeite() {
  return <ImBau titel="Datenschutz" punkt="Datenschutzerklärung der Instanz (Punkt 32)" />;
}

export function ImpressumSeite() {
  return <ImBau titel="Impressum" punkt="Impressum der Instanz (Punkt 32)" />;
}

export function NutzungsbedingungenSeite() {
  return <ImBau titel="Nutzungsbedingungen" punkt="Nutzungsbedingungen der Instanz (Punkt 32)" />;
}
