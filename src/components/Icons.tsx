/** Line icons of the tool rail: square caps and joins, like the brand's angular forms. */
const PFADE: Record<string, string> = {
  home: 'M3 9.5 10 3.5l7 6V17H3z',
  crm: 'M3 4h14v4H3zM3 12h9v4H3z',
  kunden: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  todo: 'M3 3h4v14H3zM8 3h4v9H8zM13 3h4v12h-4z',
  whiteboard: 'M2 3h16v11H2zM6 17l4-3 4 3M5 10l3-3 2 2 4-4',
  angebote: 'M5 2h7l3 3v13H5zM8 8h5M8 11h5M8 14h3',
  contact: 'M2 5h16v10H2zM2 5l8 6 8-6',
  audit: 'M3 15 7 9l3 3 4-6 3 4M3 3v14h14',
  social: 'M4 4h12v9H9l-4 3v-3H4z',
  leads: 'M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM13.5 13.5 18 18',
  magnete: 'M5 3v7a5 5 0 0 0 10 0V3h-3v7a2 2 0 0 1-4 0V3zM5 6h3M12 6h3',
  hell: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16',
  dunkel: 'M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5 6.5 6.5 0 1 0 15.5 12.5z',
  hilfe: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM7.8 7.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.6M10 14.2v.3',
  abmelden: 'M8 3H3v14h5M13 6l4 4-4 4M17 10H7',
  frage: 'M10 2.5l1.7 4.8 4.8 1.7-4.8 1.7L10 15.5l-1.7-4.8L3.5 9l4.8-1.7z',
  rueckgaengig: 'M7 12 3 8l4-4M3 8h9a4.5 4.5 0 0 1 0 9H9',
  haken: 'M4 10.5l4 4 8-9',
  regler: 'M3 5h7M14 5h3M3 10h2M9 10h8M3 15h9M16 15h1M12 3v4M7 8v4M14 13v4',
  eingang: 'M2.5 11h4.5l1.5 2.5h3L13 11h4.5M2.5 11 5 4h10l2.5 7v5h-15z',
  plattform: 'M3 3h14v5H3zM3 12h14v5H3zM6 5.5h1M6 14.5h1',
  schloss: 'M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3',
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
