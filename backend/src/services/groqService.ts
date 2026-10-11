import Groq from 'groq-sdk';
import { CategoryModel } from '../models/Category';

export interface AICategorizationResult {
  categoryName: string;
  confidenceScore: number;
  reasoning: string;
}

export class GroqService {
  private static groqClient: Groq | null = null;

  private static getClient(): Groq | null {
    if (!this.groqClient) {
      const apiKey = process.env.GROQ_API_KEY;
      if (apiKey) {
        this.groqClient = new Groq({ apiKey });
      }
    }
    return this.groqClient;
  }

  public static async classifyEmailContent(
    sender: string,
    subject: string,
    bodyText: string
  ): Promise<AICategorizationResult> {
    const client = this.getClient();

    // Fetch existing categories from DB for prompt context
    const existingCategories = await CategoryModel.find({}).lean();
    const categoryNames = existingCategories.map((c) => c.name);

    if (!client) {
      throw new Error('GROQ_API_KEY is required for AI classification when no rule matches.');
    }

    try {
      const prompt = `You are an expert email classifier for an automated ingestion pipeline.
Analyze the following email payload and assign it to the most relevant category.

Sender: ${sender}
Subject: ${subject}
Body Snippet: ${bodyText.substring(0, 1000)}

Available Categories in DB: ${categoryNames.length > 0 ? categoryNames.join(', ') : 'Invoices & Receipts, Alerts & Security, Orders & Delivery, Financial Statements, General'}

Respond ONLY with a valid JSON object in this format:
{
  "categoryName": "Category Title",
  "confidenceScore": 0.95,
  "reasoning": "Brief explanation"
}`;

      const chatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'qwen/qwen3.8-27b',
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const responseContent = chatCompletion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseContent);

      return {
        categoryName: parsed.categoryName || 'General',
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.75,
        reasoning: parsed.reasoning || 'Categorized via Groq LLM'
      };
    } catch (error) {
      console.error('Groq AI Classification Error:', error);
      return {
        categoryName: 'General',
        confidenceScore: 0.5,
        reasoning: 'Classification error fallback to General'
      };
    }
  }

  public static async extractFinancialFields(
    sender: string,
    subject: string,
    bodyText: string
  ): Promise<Record<string, any> | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const prompt = `Extract expense fields from this email only if it clearly contains a payment, receipt, bill, order, invoice, or spend amount.

Sender: ${sender}
Subject: ${subject}
Body: ${bodyText.substring(0, 2500)}

Respond ONLY as JSON:
{
  "isExpenseEmail": true,
  "detectedAmount": 123.45,
  "currency": "INR",
  "merchantName": "Merchant",
  "paymentMode": "ONLINE",
  "detectedDate": "YYYY-MM-DD",
  "referenceNumber": "optional"
}

If no amount is present, set "isExpenseEmail": false and "detectedAmount": null.`;

      const response = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'qwen/qwen3.8-27b',
        temperature: 0,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      const amount = Number(parsed.detectedAmount);
      if (!parsed.isExpenseEmail || !Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        detectedAmount: amount,
        currency: parsed.currency || 'INR',
        merchantName: parsed.merchantName || sender,
        paymentMode: parsed.paymentMode || 'ONLINE',
        detectedDate: parsed.detectedDate,
        referenceNumber: parsed.referenceNumber
      };
    } catch (error) {
      console.error('Groq AI extraction error:', error);
      return null;
    }
  }
}
