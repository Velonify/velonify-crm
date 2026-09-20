import { useMemo, useState } from 'react';
import { useToast } from '../components/Toasts';
import { Card, PageHeader, PageState } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { istOffen, sortiereAnfragen } from '../data/eingang';
import { SchemaError } from '../data/errors';
import { useIch } from '../lib/useIch';
import { AnfrageKarte, ErledigteAnfrage } from './AnfrageKarte';
import { useEingang } from './useEingang';

export function AnfragenPage() {
  const { db, mutate } = useCrm();
  const eingang = useEingang();
  const toast = useToast();
  const team = db?.listen.team ?? [];
  const [ich] = useIch(team);
  const [zeigeErledigte, setZeigeErledigte] = useState(false);

  const sortiert = useMemo(() => sortiereAnfragen(eingang.data ?? []), [eingang.data]);
  const offen = sortiert.filter(istOffen);
  const erledigt = sortiert.filter((a) => !istOffen(a));
  const firmen = useMemo(() => (db?.firmen ?? []).filter((f) => !f.archiviert), [db]);

  if (eingang.error instanceof SchemaError) {
    return (
      <div className="page">
        <PageHeader eyebrow="Home" title="Anfragen" />
        <Card title="Noch nicht eingerichtet">
          <p>{eingang.error.message}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Home"
        title="Anfragen"
        subtitle="Was über das Formular auf velonify.de hereinkommt – hier entscheiden, was daraus wird."
        actions={
          erledigt.length > 0 && (
            <button type="button" className="button" onClick={() => setZeigeErledigte((z) => !z)}>
              {zeigeErledigte ? 'Erledigte ausblenden' : `Erledigte zeigen (${erledigt.length})`}
            </button>
          )
        }
      />
      <PageState loading={eingang.loading} error={eingang.error ?? null} onRetry={eingang.reload}>
        <div className="anfragen">
          {offen.length === 0 && (
            <Card title="Nichts offen">
              <p>Zurzeit wartet keine Anfrage. Neue kommen automatisch hier an, sobald jemand das Formular ausfüllt.</p>
            </Card>
          )}
          {offen.map((anfrage) => (
            <AnfrageKarte
              key={anfrage.id}
              anfrage={anfrage}
              firmen={firmen}
              team={team}
              ich={ich}
              onUebernehmen={async (eingabe) => {
                const { firma, deal } = await mutate((s) => s.uebernimmAnfrage(anfrage.id, eingabe));
                eingang.reload();
                toast.show(`${firma.name} ist im CRM${deal ? ' – Deal in der Pipeline angelegt' : ''}.`);
              }}
              onVerwerfen={async () => {
                await mutate((s) => s.verwirfAnfrage(anfrage.id, anfrage.geaendert_am));
                eingang.reload();
                toast.show('Anfrage verworfen.');
              }}
            />
          ))}
          {zeigeErledigte && erledigt.length > 0 && (
            <Card title="Erledigt">
              <ul className="anfragen-erledigt">
                {erledigt.map((anfrage) => (
                  <ErledigteAnfrage key={anfrage.id} anfrage={anfrage} firma={firmen.find((f) => f.id === anfrage.firma_id)} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      </PageState>
    </div>
  );
}
