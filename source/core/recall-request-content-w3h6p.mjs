import {rawMessage} from './raw-recall-d14c3.mjs';
import {continuityMessage} from './continuity-w3h6b.mjs';
// All trusted request builders use the same recall envelope; verification stays in the core.
export function recallRequestContent(run){return rawMessage(run.selected,run.raw_evidence)+continuityMessage(run.continuity);}
