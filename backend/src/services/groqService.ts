import Groq from 'groq-sdk';
import { CategoryModel } from '../models/Category.js';

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
      if (apiKey && apiKey !== 'mock_groq_key') {
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
      // Fallback heuristic classification when API key is unconfigured or in mock mode
      const textLower = (subject + ' ' + bodyText).toLowerCase();
      let inferred = 'General';
      let confidence = 0.85;

      if (textLower.includes('invoice') || textLower.includes('bill') || textLower.includes('receipt') || textLower.includes('payment')) {
        inferred = 'Invoices & Receipts';
      } else if (textLower.includes('alert') || textLower.includes('warning') || textLower.includes('security') || textLower.includes('notice')) {
        inferred = 'Alerts & Security';
      } else if (textLower.includes('order') || textLower.includes('shipping') || textLower.includes('track') || textLower.includes('delivery')) {
        inferred = 'Orders & Delivery';
      } else if (textLower.includes('statement') || textLower.includes('bank') || textLower.includes('account')) {
        inferred = 'Financial Statements';
      }

      return {
        categoryName: inferred,
        confidenceScore: confidence,
        reasoning: 'Fallback heuristic match based on keyword patterns'
      };
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
        model: 'llama-3.1-8b-instant',
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
}
