import { useEffect, useState } from "react";
import forest from "../assets/backgrounds/forest-mist.webp";
import coast from "../assets/backgrounds/danish-coast.webp";
import type { Background } from "./appearance";

const bundled = { forest, coast };

function openImages(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("timeros.images.v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backgrounds");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withImages<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openImages();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("backgrounds", mode);
      const request = run(transaction.objectStore("backgrounds"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveBackground(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 12 * 1024 * 1024) {
    throw new Error("Choose a PNG, JPEG, or WebP image up to 12 MB.");
  }
  const image = await createImageBitmap(file).catch(() => null);
  if (!image) throw new Error("This image could not be opened.");
  const largestSide = Math.max(image.width, image.height);
  image.close();
  if (largestSide > 8192) throw new Error("Choose an image up to 8192 pixels on either side.");
  const id = crypto.randomUUID();
  await withImages("readwrite", store => store.add(file, id));
  return { id, name: file.name.slice(0, 240) };
}

export async function removeBackground(id: string) {
  await withImages("readwrite", store => store.delete(id));
}

export function useBackgroundImage(background: Background) {
  const id = background.kind === "local" ? background.local?.id : undefined;
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let url = "";
    void withImages("readonly", store => store.get(id)).then(async file => {
      if (cancelled) return;
      if (!(file instanceof Blob)) throw new Error("Missing background image.");
      url = URL.createObjectURL(file);
      const preview = new Image();
      preview.src = url;
      await preview.decode();
      if (!cancelled) setImage({ id, url });
    }).catch(() => {
      if (!cancelled) setImage({ id, url: "" });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const url = image?.id === id ? image?.url : undefined;
  return {
    url: background.kind === "bundled" ? bundled[background.bundled] : url,
    missing: Boolean(id && url === ""),
  };
}
