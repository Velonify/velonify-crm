-- Trello ist durch die To-dos im Hub ersetzt: Board-Link an der Firma und Startseiten-Link fallen weg.
ALTER TABLE firmen DROP COLUMN IF EXISTS trello_url;
DELETE FROM einstellungen WHERE schluessel = 'link_trello';
