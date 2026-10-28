import { PageHeader } from '../components/ui';

/** Placeholder of a page whose module is not built yet. Must not remain anywhere once the module is done. */
export function ImBau({ titel, punkt }: { titel: string; punkt: string }) {
  return (
    <div className="page">
      <PageHeader eyebrow="Im Bau" title={titel} subtitle={punkt} />
    </div>
  );
}
