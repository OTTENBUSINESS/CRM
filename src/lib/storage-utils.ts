import { supabase } from '@/lib/supabase';

const PRIVATE_BUCKETS = ['whatsapp-media', 'call-recordings', 'hr-documents', 'lead-attachments', 'audio'];

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function extractBucketAndPath(url: string): { bucket: string; path: string } | null {
  // Match: /storage/v1/object/public/BUCKET/PATH or /storage/v1/object/sign/BUCKET/PATH
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
  if (!match) return null;
  return { bucket: match[1], path: decodeURIComponent(match[2].split('?')[0]) };
}

export function isPrivateBucketUrl(url: string): boolean {
  if (!url) return false;
  const info = extractBucketAndPath(url);
  return info ? PRIVATE_BUCKETS.includes(info.bucket) : false;
}

export async function getSignedUrl(url: string, expiresIn = 3600): Promise<string> {
  if (!url || !isPrivateBucketUrl(url)) return url;

  // Check cache (refresh 1 min before expiry)
  const cached = signedUrlCache.get(url);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const info = extractBucketAndPath(url);
  if (!info) return url;

  const { data, error } = await supabase.storage
    .from(info.bucket)
    .createSignedUrl(info.path, expiresIn);

  if (error || !data?.signedUrl) return url;

  signedUrlCache.set(url, {
    url: data.signedUrl,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return data.signedUrl;
}

export async function resolveStorageUrls(urls: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const toResolve = urls.filter(u => u && isPrivateBucketUrl(u));

  await Promise.all(
    toResolve.map(async (url) => {
      results[url] = await getSignedUrl(url);
    })
  );

  return results;
}
