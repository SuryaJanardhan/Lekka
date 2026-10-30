export function groqApiKey(): string | undefined {
  return ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2']
    .map(name => process.env[name]?.trim())
    .find(Boolean);
}

export function groqApiKeys(): string[] {
  return [...new Set(['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2'].map(name => process.env[name]?.trim()).filter((value): value is string => Boolean(value)))];
}
