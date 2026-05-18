import { useState, useEffect } from 'react';
import { getSignedUrl, isPrivateBucketUrl } from '@/lib/storage-utils';

export function useSignedUrl(url: string | null | undefined): string | null {
  const [signedUrl, setSignedUrl] = useState<string | null>(
    url && !isPrivateBucketUrl(url) ? url : null
  );

  useEffect(() => {
    if (!url) {
      setSignedUrl(null);
      return;
    }
    if (!isPrivateBucketUrl(url)) {
      setSignedUrl(url);
      return;
    }

    let cancelled = false;
    getSignedUrl(url).then((signed) => {
      if (!cancelled) setSignedUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return signedUrl;
}

export function useSignedUrls(urls: Record<string, string | null | undefined>): Record<string, string | null> {
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const entries = Object.entries(urls).filter(([, v]) => v && isPrivateBucketUrl(v));
    if (entries.length === 0) {
      setSignedUrls(
        Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, v || null]))
      );
      return;
    }

    let cancelled = false;
    Promise.all(
      entries.map(async ([key, url]) => {
        const signed = await getSignedUrl(url!);
        return [key, signed] as const;
      })
    ).then((results) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(results);
      setSignedUrls((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, resolved[k] || v || null])),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(urls)]);

  return signedUrls;
}
