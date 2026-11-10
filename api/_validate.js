// Server-side rules for a lead (POST /api/lead). lead/index.html mirrors them for instant feedback, but this file is
// the authority: the browser is never trusted. Returns { lead, errors } with errors keyed by form field name.
export const EXPERIENCES = ['send', 'receive', 'collect', 'family', 'travel'];
export const INTERESTS = ['visa-direct', 'vxbs', 'cross-border-aft', 'demo', 'partnership'];
// The consent the visitor agrees to, by version. The server stores its own wording, not what the browser sends.
export const CONSENT = {
  v1: 'I agree that Visa may store these details and contact me about Visa money-movement solutions. I can ask for them to be deleted at any time.',
};
export const LIMITS = { fullName: 120, email: 200, company: 160, jobTitle: 120, phone: 40, message: 1000, minFillMs: 2500 };

const str = v => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const text = v => (typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').trim() : '');
// local@domain.tld: no spaces, one @, no leading/trailing/double dots, a TLD of 2+ letters
const EMAIL = /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;
const LETTER = /\p{L}/u;
const NAME_OK = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

export function validate(b, { now = Date.now() } = {}) {
  const errors = {};
  const lead = {
    full_name: str(b.fullName), email: str(b.email).toLowerCase(), company: str(b.company), job_title: str(b.jobTitle),
    phone: str(b.phone), message: text(b.message),
    experience: EXPERIENCES.includes(b.experience) ? b.experience : null,
    interests: Array.isArray(b.interests) ? [...new Set(b.interests.filter(i => INTERESTS.includes(i)))] : [],
    consent: b.consent === true, consent_version: typeof b.consentVersion === 'string' && CONSENT[b.consentVersion] ? b.consentVersion : null,
    source: str(b.source).slice(0, 60) || 'booth-qr',
  };
  if (!lead.full_name) errors.fullName = 'Please enter your name.';
  else if (lead.full_name.length < 2 || !LETTER.test(lead.full_name) || !NAME_OK.test(lead.full_name)) errors.fullName = 'Please enter your name using letters.';
  else if (lead.full_name.length > LIMITS.fullName) errors.fullName = `Please keep your name under ${LIMITS.fullName} characters.`;
  if (!lead.email) errors.email = 'Please enter your email address.';
  else if (lead.email.length > LIMITS.email || !EMAIL.test(lead.email)) errors.email = 'Please enter a valid email address, like name@company.com.';
  if (lead.company.length > LIMITS.company) errors.company = `Please keep this under ${LIMITS.company} characters.`;
  if (lead.job_title.length > LIMITS.jobTitle) errors.jobTitle = `Please keep this under ${LIMITS.jobTitle} characters.`;
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, '');
    if (!/^\+?[\d\s().-]+$/.test(lead.phone) || digits.length < 7 || digits.length > 15) errors.phone = 'Please enter a phone number with 7 to 15 digits, e.g. +84 912 345 678.';
    else lead.phone = (lead.phone.trim().startsWith('+') ? '+' : '') + digits; // store E.164-like digits
  }
  if (lead.message.length > LIMITS.message) errors.message = `Please keep your message under ${LIMITS.message} characters.`;
  if (!lead.consent || !lead.consent_version) errors.consent = 'Please agree so we can contact you.';
  // bots: a filled honeypot or a form sent faster than a person can fill it
  const spam = !!str(b.website) || (Number.isFinite(b.startedAt) && now - b.startedAt < LIMITS.minFillMs);
  return { lead, errors, spam };
}
