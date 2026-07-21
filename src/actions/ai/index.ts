/**
 * The clean-room LLM `generate_text` family — one action per provider, all built
 * from the shared {@link makeGenerateText} factory. Each `type` is
 * `<slug>.generate_text` where the slug (openai | claude | gemini | mistral) also
 * drives the brand icon.
 */
export {
  type GenerateInput,
  type GenerateTextOutput,
  makeGenerateText,
  type ProviderConfig,
} from './generate-text';
export { openaiGenerateText } from './openai';
export { claudeGenerateText } from './claude';
export { geminiGenerateText } from './gemini';
export { mistralGenerateText } from './mistral';

import { claudeGenerateText } from './claude';
import { geminiGenerateText } from './gemini';
import { mistralGenerateText } from './mistral';
import { openaiGenerateText } from './openai';

/** Every AI action, flattened for catalog registration. */
export const aiActions = [openaiGenerateText, claudeGenerateText, geminiGenerateText, mistralGenerateText];
