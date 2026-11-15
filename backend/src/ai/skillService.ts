import { ReadGateway } from './readGateway';
import { buildRequest, chooseSkill } from './router';
import { formatSkillReply } from './formatReply';
import { detectWatchFindings } from './watchDetection';
import { AiProvider, inputUpperBound } from './provider';
import { aiError, SkillRequest, validateRequest } from './contract';
import { hasPeriod } from './periods';

const gateway = new ReadGateway();

function conversationalMessages(message: string, history: Array<{ role: string; content: string }>) {
  const system = 'You are Lekka, a concise personal finance assistant. Reply naturally and directly. Do not claim current ledger facts unless they appear in the supplied conversation. Prior assistant figures are historical context, not a fresh query. For new financial totals, ask to run @spending, @compare, @search, @review, @rules or @insights. Never invent records, causes or balances.';
  const recent = history.filter(row => ['user', 'assistant'].includes(row.role) && row.content !== message)
    .slice(-2).map(row => ({ role: row.role, content: row.content.slice(-120) }));
  const messages: any[] = [{ role: 'system', content: system }, ...recent, { role: 'user', content: message }];
  while (recent.length && inputUpperBound(messages) > 800) {
    recent.shift();
    messages.splice(1, 1);
  }
  return messages;
}

function isContextualExplanation(message: string) {
  return /^(?:why\s+(?:is|are|did|does|was|were|that|this|it)\b|how\s+(?:did|does|is|are|much|come)\b|explain\s+(?:that|this|it|the result|why)\b|tell me more\b|more details\b|what does that mean\b)/i.test(message.trim());
}

export class SkillService {
  static async respond(message: string, history: Array<{ role: string; content: string }> = [], context?: SkillRequest) {
    if (message.length > 240) throw aiError('Keep the question under 240 characters for the small AI budget.');
    const selected = chooseSkill(message);
    const explicitSkill = /(?:^|\s)@[a-z]+\b/i.test(message);
    const modeText = message.replace(/["\u201c][^"\u201d]*["\u201d]/g, '');
    const modeComparison = (!selected || ['spending', 'compare'].includes(selected)) && /\bcash\b/i.test(modeText) && /\bonline\b/i.test(modeText);
    let skill = modeComparison ? 'spending' as const : selected;
    const previousRequest = context ? validateRequest(context) : undefined;
    const contextualExplanation = Boolean(!explicitSkill && previousRequest && isContextualExplanation(message));
    if (contextualExplanation && previousRequest) skill = previousRequest.skill;
    const prior = history.filter(row => row.role === 'user' && row.content !== message).at(-1);
    const followup = !explicitSkill && /^(?:(?:and |what about |same |instead )|(?:next )?page\s*\d*\s*$|\d{1,3}$|(?:last|this) (?:month|week|year)\s*[?!.]*$)/i.test(message);
    const priorSkill = prior ? chooseSkill(prior.content) : undefined;
    if (!skill && followup) skill = previousRequest?.skill || priorSkill;
    if (!skill && /^(?:hi|hello|hey|help|what can (?:you|u) do)[!.?\s]*$/i.test(message)) return { reply: 'I can calculate spending and credits, compare periods, search transactions, show reviews and rules, provide AI-based @insights, and run the scheduled @watch agent.', toolUsed: null, aiCalls: 0 };
    if (!skill) {
      const messages = conversationalMessages(message, history);
      const response = await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, ...{ reasoning_effort: 'none' } });
      return { reply: response.choices[0]?.message?.content || 'Please narrow the question or choose a skill.', aiCalls: 1 };
    }
    if (skill === 'watch') {
      const data = await gateway.watchData(); const findings = detectWatchFindings(data);
      const facts = findings.map(row => row.message).join('\n');
      const coverage = data.truncated ? 'Checked 200 newly processed debit records; additional records were not inspected.' : `Checked ${data.recent.length} newly processed debit records. No records were changed.`;
      if (!findings.length) return { reply: `${coverage}\nNo matching spending-watch flags. This is a limited heuristic check, not a fraud guarantee.`, toolUsed: 'watch', aiCalls: 0 };
      let explanation = '';
      const messages: any[] = [{ role: 'system', content: 'Explain these spending flags briefly. They are possibilities, not proof. Do not invent facts, recalculate totals or recommend automatic changes.' }, { role: 'user', content: facts }];
      if (inputUpperBound(messages) <= 800) {
        try { const response = await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, ...{ reasoning_effort: 'none' } }, 'watch'); explanation = response.choices[0]?.message?.content || ''; } catch {}
      }
      return { reply: `${coverage}\n${facts}${explanation ? `\n\n${explanation}` : ''}`, toolUsed: 'watch', aiCalls: explanation ? 1 : 0 };
    }
    const categories = await gateway.categories();
    let request = contextualExplanation && previousRequest
      ? previousRequest
      : buildRequest(skill, message, categories.map(row => String(row.name)));
    if (modeComparison) request = { ...request, mode: undefined, view: 'modes' };
    if (followup && (previousRequest?.skill === skill || (prior && priorSkill === skill))) {
      const old = previousRequest?.skill === skill ? previousRequest : buildRequest(skill, prior!.content, categories.map(row => String(row.name)));
      if (/^(?:next )?page/i.test(message) || /^\d+$/.test(message)) request = { ...old, page: /next page/i.test(message) ? old.page + 1 : /^\d+$/.test(message) ? Number(message) : request.page };
      else request = { ...request, range: hasPeriod(message) ? request.range : old.range, previous: hasPeriod(message) ? request.previous : old.previous,
        category: request.category || old.category, mode: request.mode || old.mode, view: request.view || old.view, term: request.term || old.term, direction: /\b(credit|debit|income|spend)/i.test(message) ? request.direction : old.direction };
    }
    let result: any, previous: any;
    if (skill === 'compare') {
      previous = await gateway.execute({ ...request, range: request.range });
      result = await gateway.execute({ ...request, range: request.previous! });
    } else result = await gateway.execute(request);
    const reply = formatSkillReply(result, request, previous);
    if (skill === 'insights') {
      const messages: any[] = [{ role: 'system', content: 'Act as a concise personal spending coach. Use only supplied facts. Explain the largest debit areas and give at most three practical observations. Never call net flow a bank balance. No markdown tables, no invented causes, no investment advice.' }, { role: 'user', content: `${message}\n${reply}` }];
      if (inputUpperBound(messages) <= 800) {
        try { const response = await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages, temperature: 0.1, ...{ reasoning_effort: 'none' } }); return { reply: `${reply}\n\nAI observations:\n${response.choices[0]?.message?.content || ''}`, toolUsed: skill, aiCalls: 1, context: request }; } catch {}
      }
      return { reply: `${reply}\n\nAI observations deferred by the small free-tier budget.`, toolUsed: skill, aiCalls: 0, context: request };
    }
    if (/\b(explain|why|how|insight)\b/i.test(message)) {
      const messages: any[] = [{ role: 'system', content: 'Explain only the supplied ledger facts in plain text. Do not invent causes, transactions or financial advice. Missing information is unknown.' }, { role: 'user', content: `${message}\n${reply}` }];
      if (inputUpperBound(messages) <= 800) {
        try { const response = await AiProvider.complete({ model: 'qwen/qwen3.8-27b', messages, temperature: 0, ...{ reasoning_effort: 'none' } }); return { reply: reply + '\n\n' + (response.choices[0]?.message?.content || ''), toolUsed: skill, aiCalls: 1, context: request }; } catch {}
      }
      return { reply: reply + '\nAI explanation deferred by the small request budget; these are calculated ledger results.', toolUsed: skill, aiCalls: 0, context: request };
    }
    return { reply, toolUsed: skill, aiCalls: 0, context: request };
  }
}
