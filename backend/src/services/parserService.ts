import { createWorker } from 'tesseract.js';

export interface ParsedEmailPayload {
  cleanText: string;
  structuredJson: Record<string, any>;
  ocrText?: string;
  hasAttachments: boolean;
}

export class ParserService {
  public static async parseEmailBody(htmlOrTextBody: string): Promise<{ cleanText: string; structuredJson: Record<string, any> }> {
    // Strip HTML tags for clean text representation
    const cleanText = htmlOrTextBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Key-value extraction heuristics (Invoices, Amounts, Reference Numbers, Dates)
    const structuredJson: Record<string, any> = {
      rawSummary: cleanText.substring(0, 300)
    };

    // Extract monetary amounts (e.g. $100.50, USD 250, Rs. 1500, ₹500)
    const amountMatch = cleanText.match(/(?:[\$₹]|USD|EUR|INR|Rs\.?)\s*([\d,]+\.?\d*)/i);
    if (amountMatch) {
      structuredJson.detectedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
      structuredJson.currency = amountMatch[0].match(/[\$₹]|USD|EUR|INR|Rs\.?/i)?.[0] || 'USD';
    }

    // Extract invoice or order reference numbers
    const refMatch = cleanText.match(/(?:invoice|order|reference|ref|receipt|id|number|#)\s*:?\s*#?\s*([A-Z0-9\-_]{4,20})/i);
    if (refMatch) {
      structuredJson.referenceNumber = refMatch[1];
    }

    // Extract dates
    const dateMatch = cleanText.match(/\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/);
    if (dateMatch) {
      structuredJson.detectedDate = dateMatch[0];
    }

    return { cleanText, structuredJson };
  }

  public static async processAttachmentImage(imageBuffer: Buffer): Promise<string> {
    try {
      const worker = await createWorker('eng');
      const ret = await worker.recognize(imageBuffer);
      await worker.terminate();
      return ret.data.text.trim();
    } catch (error) {
      console.error('OCR Processing error:', error);
      return '';
    }
  }
}
