const VIDEO_PATH = '/to-hun-stream.mp4';
const VIDEO_TYPE = 'video/mp4';
const PARTS = [
  { url: 'video-parts/to-hun.mp4.part01', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part02', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part03', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part04', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part05', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part06', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part07', size: 94371840 },
  { url: 'video-parts/to-hun.mp4.part08', size: 47607390 }
];

const TOTAL_SIZE = PARTS.reduce((sum, part) => sum + part.size, 0);

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith(VIDEO_PATH)) {
    event.respondWith(handleVideoRequest(event.request));
  }
});

async function handleVideoRequest(request) {
  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': VIDEO_TYPE,
    'Cache-Control': 'public, max-age=31536000, immutable'
  };

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(TOTAL_SIZE)
      }
    });
  }

  const range = parseRange(request.headers.get('Range'));
  if (!range) {
    return new Response(streamAllParts(), {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(TOTAL_SIZE)
      }
    });
  }

  const body = await readRange(range.start, range.end);
  return new Response(body, {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${TOTAL_SIZE}`
    }
  });
}

function parseRange(header) {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return null;

  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);

  if (start === null && end === null) return null;
  if (start === null) {
    const suffixLength = Math.max(0, end);
    start = Math.max(0, TOTAL_SIZE - suffixLength);
    end = TOTAL_SIZE - 1;
  } else {
    end = end === null ? TOTAL_SIZE - 1 : Math.min(end, TOTAL_SIZE - 1);
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= TOTAL_SIZE) {
    return null;
  }

  return { start, end };
}

async function readRange(start, end) {
  const buffers = [];
  let offset = 0;

  for (const part of PARTS) {
    const partStart = offset;
    const partEnd = offset + part.size - 1;

    if (partEnd >= start && partStart <= end) {
      const from = Math.max(start, partStart) - partStart;
      const to = Math.min(end, partEnd) - partStart;
      const buffer = await fetchPartRange(part.url, from, to);
      buffers.push(buffer);
    }

    offset += part.size;
    if (offset > end) break;
  }

  return new Blob(buffers, { type: VIDEO_TYPE });
}

async function fetchPartRange(url, start, end) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` }
  });
  const buffer = await response.arrayBuffer();

  if (response.status === 206) {
    return buffer;
  }

  return buffer.slice(start, end + 1);
}

function streamAllParts() {
  return new ReadableStream({
    async start(controller) {
      try {
        for (const part of PARTS) {
          const response = await fetch(part.url);
          const reader = response.body.getReader();

          while (true) {
            const result = await reader.read();
            if (result.done) break;
            controller.enqueue(result.value);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}
