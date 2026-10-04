import React, { useEffect, useState } from 'react';
import ax from '../api';

// Enrollment files require the same authorization as profile data. Never put
// bearer tokens in image URLs, browser history, or links copied by a user.
export default function EnrollmentImage({ src, alt = '', style, ...props }) {
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl;
    const controller = new AbortController();
    setImage(null);
    setFailed(false);
    const load = async () => {
      try {
        const apiOrigin = new URL(ax.defaults.baseURL, window.location.origin).origin;
        const url = new URL(src, src.startsWith('/api/') ? apiOrigin : window.location.origin);
        if (url.origin === apiOrigin && url.pathname.startsWith('/api/terminal/enrollment-images/')) {
          const response = await ax.get(url.pathname.slice('/api/'.length), {
            responseType: 'blob', signal: controller.signal, _skipCache: true,
          });
          if (!active) return;
          objectUrl = URL.createObjectURL(response.data);
          setImage(objectUrl);
        } else if (['http:', 'https:', 'data:'].includes(url.protocol)) {
          setImage(src);
        } else {
          setFailed(true);
        }
      } catch (error) {
        if (active && error.code !== 'ERR_CANCELED') setFailed(true);
      }
    };
    if (src) load();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!image || failed) return (
    <span role="img" aria-label={failed ? `${alt || 'Photo'} unavailable` : `Loading ${alt || 'photo'}`}
      style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-th)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
      {failed ? 'Photo unavailable' : 'Loading…'}
    </span>
  );
  return <img {...props} src={image} alt={alt} style={style} onError={() => setFailed(true)} />;
}
