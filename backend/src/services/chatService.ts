import Groq from 'groq-sdk';
import mongoose from 'mongoose';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleModel } from '../models/Rule';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ChatService {
  private static groqClient: Groq | null = null;
  private static conversationHistory: Map<string, ChatMessage[]> = new Map();

  private static getClient(): Groq | null {
    if (!this.groqClient) {
      const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY_2;
      if (apiKey && apiKey !== 'mock_groq_key') {
        this.groqClient = new Groq({ apiKey });
      }
    }
    return this.groqClient;
  }

  // Read-only database query tool execution
  private static async executeDatabaseQuery(args: {
    queryType: 'get_recent_emails' | 'search_transactions' | 'get_financial_summary' | 'get_categories' | 'get_rules';
    searchTerm?: string;
    categoryName?: string;
    limit?: number;
  }, clientState?: any): Promise<any> {
    const isMongoReady = mongoose.connection.readyState === 1;
    const limit = Math.min(args.limit || 10, 25);

    if (!isMongoReady) {
      // Graceful fallback to clientState when database is offline or buffering
      return {
        notice: 'Database is currently operating in offline cache mode.',
        clientSummary: clientState || {
          totalSpend: 0,
          categories: ['Invoices & Receipts', 'Alerts & Security', 'Orders & Delivery', 'General']
        }
      };
    }

    try {
      switch (args.queryType) {
        case 'get_recent_emails': {
          const emails = await EmailModel.find({})
            .populate('categoryId')
            .sort({ receivedAt: -1 })
            .limit(limit)
            .maxTimeMS(3000)
            .lean();
          return emails.map((e) => ({
            id: e._id,
            sender: e.sender,
            subject: e.subject,
            amount: e.parsedJson?.detectedAmount || 0,
            category: (e.categoryId as any)?.name || 'General',
            paymentMode: e.parsedJson?.paymentMode || 'ONLINE',
            date: e.receivedAt
          }));
        }

        case 'search_transactions': {
          const query: any = {};
          if (args.searchTerm) {
            const termRegex = new RegExp(args.searchTerm, 'i');
            query.$or = [{ sender: termRegex }, { subject: termRegex }, { rawTextBody: termRegex }];
          }
          const results = await EmailModel.find(query)
            .populate('categoryId')
            .sort({ receivedAt: -1 })
            .limit(limit)
            .maxTimeMS(3000)
            .lean();
          return results.map((e) => ({
            sender: e.sender,
            subject: e.subject,
            amount: e.parsedJson?.detectedAmount || 0,
            category: (e.categoryId as any)?.name || 'General',
            date: e.receivedAt
          }));
        }

        case 'get_financial_summary': {
          const allEmails = await EmailModel.find({}).maxTimeMS(3000).lean();
          const total = allEmails.reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);
          const cash = allEmails
            .filter((e) => e.parsedJson?.paymentMode === 'CASH')
            .reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);
          const friend = allEmails
            .filter((e) => e.parsedJson?.paymentMode === 'FRIEND_PAID')
            .reduce((acc, curr) => acc + (curr.parsedJson?.detectedAmount || 0), 0);
          const online = total - cash - friend;

          return {
            totalSpend: total,
            cashSpend: cash,
            friendPaidSpend: friend,
            onlineSpend: online,
            totalTransactions: allEmails.length
          };
        }

        case 'get_categories': {
          const categories = await CategoryModel.find({}).maxTimeMS(3000).lean();
          return categories.map((c) => ({ id: c._id, name: c.name, source: c.createdSource }));
        }

        case 'get_rules': {
          const rules = await RuleModel.find({}).populate('categoryId').maxTimeMS(3000).lean();
          return rules.map((r) => ({
            id: r._id,
            category: (r.categoryId as any)?.name || 'Unassigned',
            conditions: r.conditions
          }));
        }

        default:
          return { error: 'Unknown query type' };
      }
    } catch (err: any) {
      return { error: `Query execution error: ${err.message}` };
    }
  }

  public static async processChatMessage(params: {
    sessionId: string;
    userMessage: string;
    clientState?: any;
    history?: ChatMessage[];
  }): Promise<{ reply: string; toolUsed?: string }> {
    const client = this.getClient();
    const isMongoReady = mongoose.connection.readyState === 1;

    let transactionCount = 0;
    let categoriesList = ['Invoices & Receipts', 'Alerts & Security', 'Orders & Delivery', 'General'];

    if (isMongoReady) {
      try {
        const count = await EmailModel.countDocuments({}).maxTimeMS(2000);
        transactionCount = count;
        const cats = await CategoryModel.find({}).maxTimeMS(2000).lean();
        if (cats.length > 0) {
          categoriesList = cats.map((c) => c.name);
        }
      } catch {
        // Fallback gracefully
      }
    }

    const systemPrompt = `You are Lekka AI, an intelligent personal financial assistant and ledger companion embedded directly in the Lekka Wallet app.
You have full real-time awareness of the user's financial ledger, email receipts, cash expenditures, friend-paid splits, categorization rules, and database records.

App State Snapshot:
- Total Transactions Tracked: ${transactionCount || params.clientState?.transactionCount || 0}
- Current Active Categories: ${categoriesList.join(', ')}
- Client Context: ${JSON.stringify(params.clientState || {})}

Read-Only Tool Access:
You have a special tool 'query_database' with STRICT READ-ONLY access to search transactions, pull financial summaries, check active rules, and fetch recent receipts. Use this tool whenever the user asks for specific amounts, past payments, category spending, or rule details.
Never pretend you can delete or mutate records. All your database access is read-only.
Keep responses concise, helpful, friendly, and structured. Use INR (₹) for monetary amounts.`;

    // Manage conversation history for session
    let sessionHistory = this.conversationHistory.get(params.sessionId) || [];
    if (params.history && params.history.length > 0) {
      sessionHistory = params.history;
    }

    // Append new user message
    sessionHistory.push({ role: 'user', content: params.userMessage });
    if (sessionHistory.length > 20) {
      sessionHistory = sessionHistory.slice(-20);
    }

    if (!client) {
      const fallbackReply = `I am Lekka AI Assistant. Currently running in offline mode. Your ledger has ${transactionCount || params.clientState?.transactionCount || 0} tracked records totaling ₹${(params.clientState?.totalSpend || 0).toFixed(2)}. Configure GROQ_API_KEY in backend/.env for live LLM inference.`;
      sessionHistory.push({ role: 'assistant', content: fallbackReply });
      this.conversationHistory.set(params.sessionId, sessionHistory);
      return { reply: fallbackReply };
    }

    try {
      const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'query_database',
            description: 'Execute a read-only query against the Lekka database to retrieve transaction records, financial stats, categories, or active rules.',
            parameters: {
              type: 'object',
              properties: {
                queryType: {
                  type: 'string',
                  enum: ['get_recent_emails', 'search_transactions', 'get_financial_summary', 'get_categories', 'get_rules'],
                  description: 'The type of read-only query to execute.'
                },
                searchTerm: {
                  type: 'string',
                  description: 'Optional search keyword for sender, merchant, or subject.'
                },
                categoryName: {
                  type: 'string',
                  description: 'Optional category name filter.'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of items to return (default 10).'
                }
              },
              required: ['queryType']
            }
          }
        }
      ];

      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...sessionHistory.map((m) => ({ role: m.role, content: m.content }))
      ];

      // First call to Groq
      const firstResponse = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3
      });

      const choice = firstResponse.choices[0];
      const toolCalls = choice?.message?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const queryResult = await this.executeDatabaseQuery(args, params.clientState);

        // Feed tool response back into conversation
        messages.push(choice.message);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(queryResult)
        });

        const secondResponse = await client.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages,
          temperature: 0.3
        });

        const finalReply = secondResponse.choices[0]?.message?.content || 'Here are the details from your ledger.';
        sessionHistory.push({ role: 'assistant', content: finalReply });
        this.conversationHistory.set(params.sessionId, sessionHistory);

        return { reply: finalReply, toolUsed: toolCall.function.name };
      }

      const directReply = choice?.message?.content || 'How can I help you manage your Lekka ledger today?';
      sessionHistory.push({ role: 'assistant', content: directReply });
      this.conversationHistory.set(params.sessionId, sessionHistory);

      return { reply: directReply };
    } catch (err: any) {
      console.error('Chatbot error:', err);
      const errReply = 'I encountered a temporary error connecting to Groq AI. Please check your backend connection.';
      return { reply: errReply };
    }
  }

  public static clearSessionHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}
