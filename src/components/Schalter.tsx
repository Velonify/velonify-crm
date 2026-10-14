/** On/off switch for settings that take effect immediately (no save button). */
export function Schalter({ an, onChange, label, disabled = false }: { an: boolean; onChange(an: boolean): void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={an} aria-label={label} className="schalter" disabled={disabled} onClick={() => onChange(!an)} />;
}
