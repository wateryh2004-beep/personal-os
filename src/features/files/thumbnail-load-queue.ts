export const maxConcurrentPhotoThumbnails = 3;
export const photoThumbnailLoadTimeoutMs = 25_000;

type ThumbnailTicket = {
  start: (release: () => void) => void;
  release: () => void;
  started: boolean;
  finished: boolean;
};

/** FIFO admission only: no image bytes, URLs, promises, or cache are retained. */
export function createThumbnailLoadQueue() {
  const waiting: ThumbnailTicket[] = [];
  let active = 0;
  let draining = false;

  function drain() {
    if (draining) return;
    draining = true;
    try {
      while (active < maxConcurrentPhotoThumbnails && waiting.length) {
        const ticket = waiting.shift()!;
        ticket.started = true;
        active++;
        try { ticket.start(ticket.release); } catch { ticket.release(); }
      }
    } finally { draining = false; }
  }

  return function enqueue(start: ThumbnailTicket["start"]) {
    const release = () => {
      if (ticket.finished) return;
      ticket.finished = true;
      if (ticket.started) active--;
      else waiting.splice(waiting.indexOf(ticket), 1);
      drain();
    };
    const ticket: ThumbnailTicket = { start, release, started: false, finished: false };
    waiting.push(ticket);
    drain();
    return release;
  };
}

// Client module singleton: gallery cards and the photo dialog share three slots.
export const enqueuePhotoThumbnail = createThumbnailLoadQueue();
