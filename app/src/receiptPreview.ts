export function receiptPreview(body: string): string {
  // Stored receipts are plain text; restore boundaries flattened during ingestion.
  let text = body.replace(/(?:&nbsp;|&#160;|&#x0*a0;)/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\uFFFD/g, '')
    .replace(/\bDear\s+[^,\n]{1,160},\s*/i, '')
    .replace(/\bGreetings from[^!\n]{1,100}!\s*/i, '');
  const footer = text.search(/\b(?:If this transaction was not initiated|If you did not (?:make|initiate|authorise|authorize)|To block UPI|For security reasons|Warm Regards|Regards(?=[,\s])|Copyright|Unsubscribe|This email is confidential|Please do not share)\b/i);
  if (footer >= 0) text = text.slice(0, footer);
  text = text.replace(/^(?:[\d/-]+\s+)?Here['\u2019]s the summary of your transaction:\s*/i, '');
  return text.replace(/[ \t]+/g, ' ')
    .replace(/\s+(?=(?:Amount (?:Debited|Credited)|Account Number|Date\s*&\s*Time|Transaction (?:Info|ID|Details)|(?:UPI )?Reference(?: Number)?|Folio Number|Scheme|Plan|Option|SIP Amount(?:\s*\(Rs\))?|SIP Date|Distributor)\s*:)/gi, '\n')
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .split(/\n+/).map(line => line.trim()).filter(Boolean).slice(0, 5).join('\n').slice(0, 900);
}
