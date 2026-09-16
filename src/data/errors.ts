export class AuthExpiredError extends Error {
  constructor() {
    super('Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.');
    this.name = 'AuthExpiredError';
  }
}

export class GoogleApiError extends Error {
  readonly status: number;
  readonly googleMessage: string;
  constructor(status: number, message: string, googleMessage = '') {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
    this.googleMessage = googleMessage;
  }
}

/** The sheet is missing a tab or column the app needs. Fixed via the Einrichtung page. */
export class SchemaError extends Error {
  constructor(message = 'Das CRM-Sheet ist noch nicht vollständig eingerichtet. Bitte unter „Einrichtung“ auf „Einrichten“ klicken.') {
    super(message);
    this.name = 'SchemaError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Eintrag nicht gefunden – vielleicht wurde er inzwischen im Sheet entfernt.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** Someone else saved the same row after it was loaded. */
export class ConflictError extends Error {
  readonly geaendertVon: string;
  readonly geaendertAm: string;
  constructor(geaendertVon: string, geaendertAm: string) {
    super('Dieser Eintrag wurde inzwischen von jemand anderem geändert.');
    this.name = 'ConflictError';
    this.geaendertVon = geaendertVon;
    this.geaendertAm = geaendertAm;
  }
}

export class DuplicateError extends Error {
  readonly field: 'domain' | 'kuerzel';
  readonly existingId: string;
  readonly existingName: string;
  constructor(field: 'domain' | 'kuerzel', existingId: string, existingName: string) {
    const label = field === 'domain' ? 'Diese Domain' : 'Dieses Kürzel';
    super(`${label} gehört schon zu „${existingName}“.`);
    this.name = 'DuplicateError';
    this.field = field;
    this.existingId = existingId;
    this.existingName = existingName;
  }
}

/** Drive folders are not configured on the Einrichtung page yet. */
export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredError';
  }
}
