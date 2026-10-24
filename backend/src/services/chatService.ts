import Groq from 'groq-sdk';
import mongoose from 'mongoose';
import { EmailModel } from '../models/Email';
import { CategoryModel } from '../models/Category';
import { RuleModel } from '../models/Rule';
import { LedgerReportService } from './ledgerReportService';
import { groqApiKey } from '../config/groqCredentials';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ChatService {
  private static groqClient: Groq | null = null;
  private static conversationHistory: Map<string, ChatMessage[]> = new Map();

  private static getClient(): Groq | null {
    if (!this.groqClient) {
      const apiKey = groqApiKey();
      if (apiKey) {
        this.groqClient = new Groq({ apiKey, timeout: 12000, maxRetries: 0 });
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
      throw new Error('Database is not connected.');
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
            paymentMode: e.parsedJson?.paymentMode && e.parsedJson.paymentMode !== 'ONLINE' ? e.parsedJson.paymentMode : 'UPI',
            direction: e.parsedJson?.transactionDirection || 'DEBIT',
            notes: e.parsedJson?.notes || '',
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
            direction: e.parsedJson?.transactionDirection || 'DEBIT',
            category: (e.categoryId as any)?.name || 'General',
            date: e.receivedAt
          }));
        }

        case 'get_financial_summary': {
          const report = await LedgerReportService.getDashboardStats();
          const cash = report.paymentModeBreakdown.find((item) => item.mode === 'CASH')?.totalAmount || 0;
          const friend = report.paymentModeBreakdown.find((item) => item.mode === 'FRIEND_PAID')?.totalAmount || 0;
          const total = report.summary.totalFinancialAmount;
          return {
            totalSpend: total,
            cashSpend: cash,
            friendPaidSpend: friend,
            onlineSpend: total - cash - friend,
            totalCredits: report.summary.totalCredits,
            pendingReviews: report.summary.pendingReviews,
            netAmount: report.summary.netAmount,
            categories: report.categoryBreakdown,
            totalTransactions: report.summary.totalTransactions,
            period: report.period
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
    let categoriesList: string[] = [];

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

    const state = params.clientState || {};
    const compactState = {
      currentScreen: state.currentScreen, totals: state.totals, period: state.analytics?.period, responseStyle: state.responseStyle,
      categories: Array.isArray(state.categories) ? state.categories.map((c: any) => ({ id: c._id, name: c.name })) : [],
      recentEntries: Array.isArray(state.recentEntries) ? state.recentEntries.slice(0, 5) : [],
      reviewEntries: Array.isArray(state.reviewEntries) ? state.reviewEntries.slice(0, 3) : [],
      rules: Array.isArray(state.rules) ? state.rules.slice(0, 6).map((r: any) => ({ category: r.categoryId?.name, conditions: r.conditions })) : [],
      notifications: Array.isArray(state.notifications) ? state.notifications.slice(0, 3).map((n: any) => ({ title: n.title, message: String(n.message || '').slice(0, 180) })) : []
    };
    const systemPrompt = `You are Lekka AI, an intelligent personal financial assistant and ledger companion embedded directly in the Lekka Wallet app.
You have full real-time awareness of the user's financial ledger, email receipts, cash expenditures, friend-paid splits, categorization rules, and database records.

App State Snapshot:
- Total Transactions Tracked: ${transactionCount || params.clientState?.transactionCount || 0}
- Current Active Categories: ${categoriesList.join(', ')}
- Client Context: ${JSON.stringify(compactState)}

Read-Only Tool Access:
You have a special tool 'query_database' with STRICT READ-ONLY access to search transactions, pull financial summaries, check active rules, and fetch recent receipts. Use this tool whenever the user asks for specific amounts, past payments, category spending, or rule details.
Never pretend you can delete or mutate records. All your database access is read-only. Use tools for complete financial totals; the recent-entry context is only a preview, not the whole ledger. Distinguish incoming credits from outgoing debits; never count credits as spending. Never treat a missing field as zero; query it or say that it is unavailable.
Keep responses concise and use short plain-text lines, not markdown tables or markers. Use INR (₹) for monetary amounts.`;

    // Manage conversation history for session
    const sourceHistory = params.history?.length ? params.history : this.conversationHistory.get(params.sessionId) || [];
    let sessionHistory: ChatMessage[] = sourceHistory.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && !m.content.includes('temporary error connecting to Groq')).slice(-6)
      .map(m => ({ role: m.role, content: m.content.slice(0, 600) }));

    // Append new user message
    if (sourceHistory.at(-1)?.role === 'user' && sourceHistory.at(-1)?.content === params.userMessage && sessionHistory.length) sessionHistory[sessionHistory.length - 1] = { role: 'user', content: params.userMessage.slice(0, 2000) };
    else sessionHistory.push({ role: 'user', content: params.userMessage.slice(0, 2000) });
    if (sessionHistory.length > 20) {
      sessionHistory = sessionHistory.slice(-20);
    }

    if (!client) {
      throw new Error('GROQ_API_KEY is required for Lekka AI chat.');
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

      let usedTools = false;
      // Keep tool definitions on follow-up requests so additional calls stay structured.
      for (let round = 0; round < 3; round++) {
        const response = await client.chat.completions.create({
          model: 'qwen/qwen3.8-27b',
          ...{ reasoning_effort: 'none' },
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 512
        });

        const choice = response.choices[0];
        const toolCalls = choice?.message?.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
          usedTools = true;
          messages.push(choice.message);
          const toolResponses = await Promise.all(toolCalls.map(async toolCall => {
            let queryResult;
            try {
              const args = JSON.parse(toolCall.function.arguments || '{}');
              queryResult = toolCall.function.name === 'query_database' ? await this.executeDatabaseQuery(args, params.clientState) : { error: 'Unsupported read-only tool' };
            } catch { queryResult = { error: 'Invalid tool arguments' }; }
            return { role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify(queryResult) };
          }));
          messages.push(...toolResponses);
          continue;
        }

        const directReply = choice?.message?.content;
        if (!directReply?.trim() || /<tool_call>|<function[=\s]/i.test(directReply)) throw new Error('AI returned no readable answer');
        sessionHistory.push({ role: 'assistant', content: directReply });
        this.conversationHistory.set(params.sessionId, sessionHistory);

        return { reply: directReply, ...(usedTools ? { toolUsed: 'query_database' } : {}) };
      }
      throw new Error('AI exceeded its read-only query limit');
    } catch (err: any) {
      const status = Number(err.status) || 0;
      console.error('[Chat] Provider request failed', { status, code: err.code || err.name });
      const message = status === 429 ? 'AI rate limit reached. Please try again shortly.' : status === 401 || status === 403 ? 'AI credentials or model access need attention.' : /timeout/i.test(err.name || '') ? 'AI request timed out. Please retry.' : 'AI could not complete this request. Please retry.';
      throw Object.assign(new Error(message), { status: status === 429 ? 429 : 502 });
    }
  }

  public static clearSessionHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}
