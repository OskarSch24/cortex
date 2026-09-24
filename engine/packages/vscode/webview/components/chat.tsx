/**
 * Der Chat im Aufbau der Codex-App.
 *
 * Eine Antwort ist kein Kasten, sondern Fließtext. Was der Agent dazwischen
 * getan hat, steht als graue Tätigkeitszeile im Text — einzeln, wenn es ein
 * Schritt war, als aufklappbarer Satz („Hat Dateien gelesen und hat einen
 * Befehl ausgeführt“), wenn es mehrere waren. Ist der Auftrag fertig, faltet
 * sich alles bis auf die Schlussantwort hinter „… lang gearbeitet ›“.
 */

export { Icon } from './chat/Icon.js';
export { formatWorked } from '../format/duration.js';
export { formatStamp } from './chat/time.js';
export { ActivityGroup, describeCommand, groupSentence, splitTurn, WorkedFor, type ChatActions } from './chat/steps.js';
export { DateDivider, UserMessage, type UserMessageActions } from './chat/UserMessage.js';
export { localUrl, localUrls, WebPreviewCard } from './chat/WebPreviewCard.js';
export { TurnChanges, turnFiles, type TurnFile } from './chat/TurnChanges.js';
