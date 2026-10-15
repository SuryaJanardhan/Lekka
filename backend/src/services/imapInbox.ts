import { createHash } from 'crypto';
import { ImapFlow, SearchObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { admitMail, chooseUidBatch, exactSenderMatch, MailFilters, testSubjectPrefix } from './mailAdmission';

export interface InboxCursor { key: string; lastUid: number }
export interface InboxMail {
  messageId: string;
  sender: string;
  transportSender: string;
  subject: string;
  body: string;
  receivedAt: Date;
  arrivedAt: Date;
  isTest: boolean;
  admissionReason: string;
  attachments: Array<{ contentType: string; content: Buffer }>;
}
export interface InboxSettings extends MailFilters {
  user: string;
  password: string;
  scanLimit: number;
  processLimit: number;
}

function validDate(value: Date | string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function scanImapInbox(settings: InboxSettings, savedCursor?: InboxCursor, preview = false) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 15000, socketTimeout: 20000
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      if (!client.mailbox) throw new Error('Gmail Inbox could not be opened');
      const mailbox = client.mailbox;
      const key = createHash('sha256').update(JSON.stringify({
        user: settings.user.toLowerCase(), folder: 'INBOX', validity: String(mailbox.uidValidity),
        senders: [...settings.selectedSenders].map(s => s.toLowerCase()).sort(),
        forwarders: [...settings.trustedForwarders].map(s => s.toLowerCase()).sort(),
        testRecipient: settings.testRecipient, scanLimit: settings.scanLimit
      })).digest('hex');
      const lastUid = !preview && savedCursor?.key === key ? savedCursor.lastUid : undefined;
      const conditions: SearchObject[] = [...new Set([...settings.selectedSenders, ...settings.trustedForwarders])].map(from => ({ from }));
      if (settings.testRecipient) conditions.push({ to: settings.testRecipient }, { header: { 'Delivered-To': settings.testRecipient } });
      const query: SearchObject = conditions.length === 1 ? { ...conditions[0] } : { or: conditions };
      if (lastUid !== undefined) query.uid = `${lastUid + 1}:*`;
      const found = mailbox.exists ? await client.search(query, { uid: true }) : [];
      const uids = Array.isArray(found) ? found.filter(uid => lastUid === undefined || uid > lastUid) : [];
      const batch = chooseUidBatch(uids, settings.scanLimit, lastUid);
      const headers = batch.length ? await client.fetchAll(batch, { uid: true, envelope: true, internalDate: true }, { uid: true }) : [];
      headers.sort((left, right) => left.uid - right.uid);
      const mails: InboxMail[] = [];
      const samples: Array<{ uid: number; sender: string; subject: string; reason: string; arrivedAt?: Date }> = [];
      let checkpoint = lastUid || 0;
      let bodiesRead = 0;
      let ignored = 0;
      for (const header of headers) {
        const sender = header.envelope?.from?.[0]?.address || '';
        const subject = header.envelope?.subject || 'No Subject';
        const tagged = Boolean(settings.testRecipient) && subject.trim().toUpperCase().startsWith(testSubjectPrefix);
        const candidate = exactSenderMatch(sender, settings.selectedSenders) || exactSenderMatch(sender, settings.trustedForwarders) || tagged;
        if (candidate && bodiesRead >= settings.processLimit) break;
        if (!candidate) {
          ignored++;
          if (samples.length < 30) samples.push({ uid: header.uid, sender, subject: subject.slice(0, 160), reason: 'sender_or_test_subject_not_allowed' });
          checkpoint = header.uid;
          continue;
        }
        const raw = await client.fetchOne(String(header.uid), { source: true }, { uid: true });
        bodiesRead++;
        if (!raw || !raw.source) { checkpoint = header.uid; continue; }
        const outer = await simpleParser(raw.source);
        const result = await admitMail(outer, settings);
        const arrivedAt = validDate(header.internalDate) || validDate(outer.date) || new Date();
        if (samples.length < 30) samples.push({ uid: header.uid, sender, subject: subject.slice(0, 160), reason: result.reason, arrivedAt });
        if (result.accepted) {
          const mail = result.mail;
          mails.push({
            messageId: mail.messageId || outer.messageId || `imap:${settings.user}:${mailbox.uidValidity}:${header.uid}`,
            sender: result.sender, transportSender: result.transportSender,
            subject: mail.subject || subject,
            body: mail.text || (typeof mail.html === 'string' ? mail.html : '') || mail.subject || subject,
            receivedAt: validDate(mail.date) || arrivedAt, arrivedAt,
            isTest: result.isTest, admissionReason: result.reason,
            attachments: mail.attachments.map(attachment => ({ contentType: attachment.contentType, content: attachment.content }))
          });
        } else ignored++;
        checkpoint = header.uid;
      }
      if (preview && mailbox.exists && samples.length < 10) {
        const recent = await client.fetchAll(`${Math.max(1, mailbox.exists - 9)}:*`, { uid: true, envelope: true, internalDate: true });
        for (const header of recent.reverse()) {
          if (samples.some(sample => sample.uid === header.uid)) continue;
          samples.push({ uid: header.uid, sender: header.envelope?.from?.[0]?.address || '', subject: (header.envelope?.subject || '').slice(0, 160), reason: 'outside_selected_sender_or_test_recipient_search', arrivedAt: validDate(header.internalDate) });
          if (samples.length >= 10) break;
        }
      }
      return {
        mails, cursor: { key, lastUid: checkpoint },
        diagnostics: {
          mailbox: settings.user, folder: 'INBOX', inboxMessages: mailbox.exists,
          selectedSenders: settings.selectedSenders, trustedForwarders: settings.trustedForwarders,
          testRecipient: settings.testRecipient || null, testSubjectPrefix,
          matchingSearchCount: uids.length, headersRead: headers.length, bodiesRead, admitted: mails.length, ignored,
          hasMore: uids.some(uid => uid > checkpoint),
          olderMatchesOutsideRecoveryWindow: lastUid === undefined ? Math.max(0, uids.length - batch.length) : 0,
          samples
        }
      };
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => undefined); }
}
