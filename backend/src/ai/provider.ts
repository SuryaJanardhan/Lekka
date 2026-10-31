import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { AiProviderState, AiResponseCache } from './providerState';
import { groqApiKeys } from '../config/groqCredentials';
import { aiError } from './contract';

export type AiPurpose = 'chat' | 'watch' | 'email';
export const AI_LIMITS = { input: 800, output: 200, minuteCalls: 5, minuteTokens: 6000, dailyCalls: 100, dailyTokens: 80000 };
const fingerprint = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 20);
export function inputUpperBound(messages: unknown): number { return Buffer.byteLength(JSON.stringify(messages), 'utf8') + 96; }

export class AiProvider {
  static async complete(params: ChatCompletionCreateParamsNonStreaming, purpose: AiPurpose = 'chat') {
    const keys = groqApiKeys();
    if (!keys.length) throw aiError('AI is not configured', 503);
    const bytes = inputUpperBound(params.messages);
    if (purpose !== 'email' && bytes > AI_LIMITS.input) throw aiError('Request is too large for the small AI budget. Narrow the question or use a skill.', 413);
    const output = purpose === 'email' ? Math.min(Number(params.max_tokens || 512), 1600) : AI_LIMITS.output;
    const cacheId = createHash('sha256').update(JSON.stringify({ params, purpose, output })).digest('hex');
    const cached = await AiResponseCache.findOne({ _id: cacheId, expiresAt: { $gt: new Date() } }).lean();
    if (cached?.response) return cached.response as Groq.Chat.Completions.ChatCompletion;
    const reserved = bytes + output;
    if (reserved > AI_LIMITS.minuteTokens) throw aiError('Email context exceeds the free-tier request budget. Manual review is required.', 413);
    const now = Date.now(); const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
    const cooldown = await AiProviderState.findById('cooldown:model').lean();
    if (cooldown?.until && cooldown.until.getTime() > now) throw Object.assign(aiError('AI is cooling down. Calculated results are still available.', 429), { retryAfter: Math.ceil((cooldown.until.getTime() - now) / 1000) });
    const available = await AiProviderState.find({ _id: { $in: keys.map(key => `key:${fingerprint(key)}`) } }).lean();
    if (keys.every(key => available.some(state => state._id === `key:${fingerprint(key)}` && state.until && state.until.getTime() > now))) throw aiError('AI keys are cooling down or need attention. No request was reserved.', 429);
    // Database reservations survive serverless restarts; keys do not multiply the shared budget.
    await mongoose.connection.transaction(async session => {
    for (const [id, maxCalls, maxTokens, lifetime] of [[`day:${day}`, AI_LIMITS.dailyCalls, AI_LIMITS.dailyTokens, 3 * 86400000], [`minute:${minute}`, AI_LIMITS.minuteCalls, AI_LIMITS.minuteTokens, 120000]] as const) {
      await AiProviderState.updateOne({ _id: id }, { $setOnInsert: { calls: 0, tokens: 0, expiresAt: new Date(now + lifetime) } }, { upsert: true, session });
      const reservation = await AiProviderState.findOneAndUpdate({ _id: id, calls: { $lt: maxCalls }, tokens: { $lte: maxTokens - reserved } }, { $inc: { calls: 1, tokens: reserved } }, { new: true, session }).lean();
      if (!reservation) throw Object.assign(aiError('Free-tier AI budget is busy. Calculated results are still available.', 429), { retryAfter: id.startsWith('day:') ? Math.ceil((86400000 - now % 86400000) / 1000) : Math.ceil((60000 - now % 60000) / 1000) });
    }
    });
    const turn = await AiProviderState.findOneAndUpdate({ _id: 'rotation' }, { $inc: { counter: 1 } }, { upsert: true, new: true }).lean();
    const start = ((turn?.counter || 1) - 1) % keys.length;
    for (let index = 0; index < keys.length; index++) {
      const key = keys[(start + index) % keys.length], id = `key:${fingerprint(key)}`;
      const state = await AiProviderState.findById(id).lean();
      if (state?.until && state.until.getTime() > Date.now()) continue;
      try {
        const client = new Groq({ apiKey: key, timeout: 12000, maxRetries: 0 });
        const { data, response } = await client.chat.completions.create({ ...params, max_tokens: output }).withResponse();
        const number = (header: string) => { const value = response.headers.get(header); return value !== null && Number.isFinite(Number(value)) ? Number(value) : undefined; };
        const content = data.choices[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim() || /<tool_call>|<function[=\s]/i.test(content)) throw aiError('AI did not return a readable answer', 502);
        try {
          await AiProviderState.updateOne({ _id: 'usage:last' }, { $set: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens, remainingTokens: number('x-ratelimit-remaining-tokens'), remainingRequests: number('x-ratelimit-remaining-requests') } }, { upsert: true });
          await AiResponseCache.updateOne({ _id: cacheId }, { $set: { response: data, expiresAt: new Date(Date.now() + 300000) } }, { upsert: true });
        } catch { console.error('[AI] Response returned; optional usage/cache persistence deferred'); }
        return data;
      } catch (error: any) {
        if ([401, 403, 429].includes(error.status)) {
          const header = Number(error.headers?.['retry-after'] || error.headers?.get?.('retry-after'));
          const seconds = Number.isFinite(header) && header > 0 ? Math.min(header, 86400) : error.status === 429 ? 60 : 3600;
          await AiProviderState.updateOne({ _id: id }, { $set: { until: new Date(Date.now() + seconds * 1000), expiresAt: new Date(Date.now() + 2 * 86400000) } }, { upsert: true });
          // Do not hammer the same organization's shared limit with other keys.
          if (error.status === 429) {
            await AiProviderState.updateOne({ _id: 'cooldown:model' }, { $set: { until: new Date(Date.now() + seconds * 1000), expiresAt: new Date(Date.now() + 2 * 86400000) } }, { upsert: true });
            throw Object.assign(aiError('AI is cooling down. Calculated results are still available.', 429), { retryAfter: seconds });
          }
          continue;
        }
        throw aiError('AI could not complete this request. Calculated results are still available.', 502);
      }
    }
    throw aiError('AI keys are cooling down or need attention. Calculated results are still available.', 429);
  }
  static async status() {
    const day = await AiProviderState.findById(`day:${Math.floor(Date.now() / 86400000)}`).lean();
    return { limits: AI_LIMITS, dailyCalls: day?.calls || 0, dailyReservedTokens: day?.tokens || 0, keyCount: groqApiKeys().length, readOnlyConfigured: Boolean(process.env.MONGODB_READONLY_URI) };
  }
}
