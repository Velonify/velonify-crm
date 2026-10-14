/** Line icons of the tool rail: square caps and joins, like the brand's angular forms. */
const PFADE: Record<string, string> = {
  home: 'M3 9.5 10 3.5l7 6V17H3z',
  crm: 'M3 4h14v4H3zM3 12h9v4H3z',
  kunden: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  todo: 'M3 3h4v14H3zM8 3h4v9H8zM13 3h4v12h-4z',
  angebote: 'M5 2h7l3 3v13H5zM8 8h5M8 11h5M8 14h3',
  contact: 'M2 5h16v10H2zM2 5l8 6 8-6',
  audit: 'M3 15 7 9l3 3 4-6 3 4M3 3v14h14',
  social: 'M4 4h12v9H9l-4 3v-3H4z',
  leads: 'M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM13.5 13.5 18 18',
  magnete: 'M5 3v7a5 5 0 0 0 10 0V3h-3v7a2 2 0 0 1-4 0V3zM5 6h3M12 6h3',
};

export function WerkzeugIcon({ id }: { id: string }) {
  if (id === 'einrichtung') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
        <path d="M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3M4 4l2 2M14 14l2 2M16 4l-2 2M6 14l-2 2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d={PFADE[id] ?? PFADE.home} />
    </svg>
  );
}
