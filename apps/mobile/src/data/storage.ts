// On-device persistence (APP_BUILD.md §1.4). The session is a JSON file in the app's document
// directory, protected by the OS sandbox; masks live in SecureStore as candidateId → cast index.
import type { ID } from "@ftb/types";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import type { LocalSession } from "@/lib/session";
import { parseSession } from "@/lib/session";

const SESSION_FILE = "ftb-session.json";
const MASK_KEY = "ftb.masks.v1";

export interface StoredMasks {
  id: string;
  createdAt: string;
  expiresAt: string;
  map: Record<ID, number>;
}

function sessionFile(): File {
  return new File(Paths.document, SESSION_FILE);
}

export function loadSession(): LocalSession | null {
  try {
    const file = sessionFile();
    return file.exists ? parseSession(file.textSync()) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: LocalSession): Promise<void> {
  try {
    const file = sessionFile();
    if (!file.exists) file.create();
    await file.write(JSON.stringify(session));
  } catch {
    // Storage can fail on web or a full disk; the in-memory session keeps working.
  }
}

export async function loadMasks(): Promise<StoredMasks | null> {
  try {
    const raw = await SecureStore.getItemAsync(MASK_KEY);
    return raw ? (JSON.parse(raw) as StoredMasks) : null;
  } catch {
    return null;
  }
}

export async function saveMasks(masks: StoredMasks | null): Promise<void> {
  try {
    if (masks) await SecureStore.setItemAsync(MASK_KEY, JSON.stringify(masks));
    else await SecureStore.deleteItemAsync(MASK_KEY);
  } catch {
    // SecureStore is unavailable on web; masks then live only in memory.
  }
}

/** "Delete everything on this phone". */
export async function deleteEverything(): Promise<void> {
  try {
    const file = sessionFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to delete.
  }
  await saveMasks(null);
}
