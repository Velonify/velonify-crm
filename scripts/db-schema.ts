// Writes db/migrationen/001_schema.sql from src/data/schema.ts. Only for the first migration; later changes get their own file.
import { writeFileSync } from 'node:fs';
import { schemaSql } from '../src/data/postgres/ddl';

writeFileSync(new URL('../db/migrationen/001_schema.sql', import.meta.url), schemaSql());
console.log('db/migrationen/001_schema.sql geschrieben');
