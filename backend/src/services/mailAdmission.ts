import { ParsedMail, simpleParser } from 'mailparser';

export const testSubjectPrefix = '[LEKKA TEST]';
export interface MailFilters {
  selectedSenders: string[];
  trustedForwarders: string[];
  testRecipient: string;
}

export function exactSenderMatch(sender: string, allowed: string[]) {
  const address = sender.trim().toLowerCase();
  return allowed.some((item) => item.trim().toLowerCase() === address);
}

export function mailSender(mail: ParsedMail) {
  return mail.from?.value[0]?.address?.trim().toLowerCase() || '';
}

function mailText(mail: ParsedMail) {
  return mail.text || (typeof mail.html === 'string' ? mail.html : '') || mail.subject || '';
}

function sentToTestRecipient(mail: ParsedMail, recipient: string) {
  if (!recipient) return false;
  const addresses = [mail.to, mail.cc, mail.bcc, mail.headers.get('delivered-to')].flatMap(headerAddresses);
  return exactSenderMatch(recipient, addresses);
}

function headerAddresses(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(headerAddresses);
  if (!value || typeof value !== 'object') return [];
  if ('address' in value && typeof value.address === 'string') return [value.address];
  if ('value' in value) return headerAddresses(value.value);
  if ('group' in value) return headerAddresses(value.group);
  return [];
}

export async function admitMail(mail: ParsedMail, filters: MailFilters) {
  const transportSender = mailSender(mail);
  if (!transportSender) return { accepted: false as const, reason: 'missing_sender', transportSender };
  if (exactSenderMatch(transportSender, filters.selectedSenders)) {
    return { accepted: true as const, reason: 'selected_sender', sender: transportSender, transportSender, mail, isTest: false };
  }
  if (sentToTestRecipient(mail, filters.testRecipient) && (mail.subject || '').trim().toUpperCase().startsWith(testSubjectPrefix)) {
    return { accepted: true as const, reason: 'tagged_test_email', sender: transportSender, transportSender, mail, isTest: true };
  }
  if (!exactSenderMatch(transportSender, filters.trustedForwarders)) {
    return { accepted: false as const, reason: 'sender_not_allowed', transportSender };
  }
  const candidates: ParsedMail[] = [];
  for (const attachment of mail.attachments) {
    if (attachment.contentType === 'message/rfc822') candidates.push(await simpleParser(attachment.content));
  }
  const lines = mailText(mail).split(/\r?\n/);
  const marker = lines.findIndex((line) => /^(?:-+\s*(?:Forwarded message|Original Message)\s*-+|Begin forwarded message:)\s*$/i.test(line.trim()));
  if (marker >= 0) candidates.push(await simpleParser(lines.slice(marker + 1).join('\n').trimStart()));
  for (const candidate of candidates) {
    const sender = mailSender(candidate);
    if (exactSenderMatch(sender, filters.selectedSenders)) {
      return { accepted: true as const, reason: 'trusted_forward', sender, transportSender, mail: candidate, isTest: false };
    }
  }
  return { accepted: false as const, reason: 'forwarded_sender_not_allowed', transportSender };
}

export function chooseUidBatch(uids: number[], limit: number, lastUid?: number) {
  const pending = [...new Set(uids)].filter((uid) => lastUid === undefined || uid > lastUid).sort((a, b) => a - b);
  return lastUid === undefined ? pending.slice(-limit) : pending.slice(0, limit);
}
