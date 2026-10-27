import type { CrmService } from '../data/crm';
import type { Whiteboard } from '../data/types';
import type { WbElement } from '../data/whiteboard';
import type { InhaltApi } from './inhalt';

/**
 * Creates a board and, with a template, saves its first drawing right away – so two people opening the new board at the
 * same time see one template, not two. Excalidraw is only loaded for that.
 */
export async function legeBoardAn(service: CrmService, inhalt: InhaltApi, input: { titel: string; firma_id: string; vorlage: string }): Promise<Whiteboard> {
  const board = await service.whiteboardAnlegen(input);
  if (!input.vorlage) return board;
  const [{ convertToExcalidrawElements }, { vorlageFuer }] = await Promise.all([import('@excalidraw/excalidraw'), import('./vorlagen')]);
  const vorlage = vorlageFuer(input.vorlage);
  if (vorlage) await inhalt.speichere(board.id, convertToExcalidrawElements(vorlage.elemente(), { regenerateIds: true }) as unknown as WbElement[]);
  return board;
}
