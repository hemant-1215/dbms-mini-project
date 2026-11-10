import { env } from '../config/env.js';

let extractorPromise: Promise<(text: string, options?: Record<string, unknown>) => Promise<{ data: Float32Array }>> | undefined;
const embeddingCache=new Map<string,Promise<number[]>>();

async function extractor() {
  extractorPromise ??= (async () => {
    const { pipeline, env: modelEnv } = await import('@huggingface/transformers');
    modelEnv.cacheDir = process.env.MODEL_CACHE_DIR ?? '/home/node/.cache/huggingface';
    const pipe = await pipeline('feature-extraction', env.MODEL_ID, { dtype: 'q8' });
    return async (text: string) => {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      return { data: output.data as Float32Array };
    };
  })();
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const cached=embeddingCache.get(text);if(cached)return cached;
  const pending=(async()=>{
  const run = await extractor();
  const result = await run(text);
  if (result.data.length !== 384) throw new Error(`Expected 384 embedding dimensions; received ${result.data.length}.`);
  return Array.from(result.data, Number);
  })();
  embeddingCache.set(text,pending);
  return pending;
}
