import { analyticsModul } from './analytics';
import { contentModul } from './content';
import { freigabenModul } from './freigaben';
import { einnahmenModul, kooperationenModul } from './kooperationen';
import type { Modul } from './modul';
import { ablageModul, kalenderModul } from './organisation';
import { startModul } from './steuerung';

/** All modules of the creator profile; their prefixes must be unique. */
export const MODULE: Modul[] = [freigabenModul, kalenderModul, ablageModul, contentModul, analyticsModul, kooperationenModul, einnahmenModul, startModul];

/** Tool a module's paths belong to: closed when the tool is off for the person (package or partner login). */
export const MODUL_WERKZEUG: Record<string, string> = {
  freigaben: 'home',
  kalender: 'kalender',
  ablage: 'ablage',
  content: 'content',
  analytics: 'analytics',
  kooperationen: 'kooperationen',
  einnahmen: 'einnahmen',
  start: 'home',
};
