import { Siegel as GemeinsamesSiegel } from '../../gemeinsam/siegel';

/** Kinds of sealed values of the portal: login links and sessions. */
export type Art = 'link' | 'sitzung';

export class Siegel extends GemeinsamesSiegel<Art> {
  constructor(schluesselBase64: string) {
    super(schluesselBase64, 'PORTAL_SCHLUESSEL');
  }
}
