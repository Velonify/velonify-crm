import { Siegel as GemeinsamesSiegel } from '../../gemeinsam/siegel';

/** Kinds of sealed values of the MCP's OAuth server. */
export type Art = 'client' | 'ablauf' | 'code' | 'access' | 'refresh';

export class Siegel extends GemeinsamesSiegel<Art> {
  constructor(schluesselBase64: string) {
    super(schluesselBase64, 'CRM_MCP_SCHLUESSEL');
  }
}
