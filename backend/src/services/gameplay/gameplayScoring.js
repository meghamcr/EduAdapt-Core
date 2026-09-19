'use strict';
const { fail } = require('./gameplayEvents');
function scoreChallenge(challenge, response) {
  // Phase 3D specifies exact case-sensitive matching. No trimming, case folding,
  // numeric conversion or Unicode normalization is silently introduced here.
  if (challenge.type === 'CLOZE') {
    if (typeof response !== 'string' || response.length > 120) fail('INVALID_RESPONSE');
    return response === challenge.correctAnswer;
  }
  if (challenge.type === 'MCQ_CLOZE') {
    if (!Number.isSafeInteger(response) || response < 0 || response >= challenge.options.length) fail('INVALID_OPTION');
    return challenge.options[response] === challenge.correctAnswer;
  }
  fail('UNSUPPORTED_CHALLENGE');
}
module.exports = { scoreChallenge };
