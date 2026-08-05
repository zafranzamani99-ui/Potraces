/**
 * Google Sheets transaction sync — appends personal-mode transactions to ONE
 * app-created spreadsheet ("Potraces Transactions") in the user's own Drive.
 * The `drive.file` scope covers create/append for app-created files; no
 * sensitive `spreadsheets` scope is requested.
 *
 * Design (v1) — APPEND-ONLY with ID dedupe:
 *   • New transactions are appended to the `Transactions` tab; edits and
 *     deletions are NOT propagated (UI copy states this). The recovery path is
 *     fullResyncTransactions() — clear the tab and rewrite everything.
 *   • Sheets append has no idempotency key, so dedupe is: unique transaction
 *     ID in column A + read-back of that column before every batch, unioned
 *     with the locally persisted `syncedSheetIds` (covers the crash window
 *     between a confirmed append and the next read-back).
 *   • An ID is recorded in `syncedSheetIds` ONLY after the append call
 *     confirms with HTTP 200 — never optimistically.
 *   • The header row carries a schema-version marker in K1; if the header
 *     differs AND the marker is gone, the user edited the sheet by hand and we
 *     refuse to write (SHEET_TAMPERED) instead of silently overwriting.
 *
 * All HTTP goes through googleApiFetch (auth, 401/403/429 retry); it does not
 * throw on non-OK statuses, so every call site inspects res.ok itself.
 */
import { googleApiFetch } from './googleDrive';
import { useBackupStore } from '../store/backupStore';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  SHEETS_SCHEMA_VERSION,
  SHEET_TAB,
  SHEET_HEADER,
  SHEETS_APPEND_CHUNK,
  transactionToSheetRow,
  filterUnsyncedTransactionIds,
  chunkArray,
} from './sheetsLogic';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const SPREADSHEET_TITLE = 'Potraces Transactions';
const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

/** Range path segments MUST be URL-encoded — the `!` and `:` are not legal
 *  bare path characters and some proxies mangle them. */
const encRange = (range: string) => encodeURIComponent(range);

async function throwNotOk(res: Response, what: string): Promise<never> {
  const detail = await res.text().catch(() => '');
  throw new Error(
    `${what} failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`,
  );
}

/**
 * Write the header row + schema marker into an empty A1:K1. If a header exists
 * but differs from ours AND the K1 schema marker is missing, the sheet was
 * tampered with — throw SHEET_TAMPERED; the caller surfaces an error state,
 * we never silently overwrite user edits.
 */
async function ensureHeader(spreadsheetId: string): Promise<void> {
  const range = encRange(`${SHEET_TAB}!A1:K1`);
  const res = await googleApiFetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`);
  if (!res.ok) await throwNotOk(res, 'Sheets header read');
  const data = (await res.json()) as { values?: string[][] };
  const row = data.values?.[0];

  if (!row || row.length === 0) {
    const put = await googleApiFetch(
      `${SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[...SHEET_HEADER, '', SHEETS_SCHEMA_VERSION]] }),
      },
    );
    if (!put.ok) await throwNotOk(put, 'Sheets header write');
    return;
  }

  const headerMatches = SHEET_HEADER.every((h, i) => (row[i] ?? '') === h);
  const hasMarker = row[10] === SHEETS_SCHEMA_VERSION;
  if (!headerMatches && !hasMarker) {
    throw new Error('SHEET_TAMPERED');
  }
}

/**
 * Find-or-create the "Potraces Transactions" spreadsheet, self-healing:
 *   1. cached backupStore.spreadsheetId → verify it still exists (404 = user
 *      deleted/trashed it in Drive → fall through and re-provision);
 *   2. Drive files.list by name + Sheets mimeType (drive.file scope only sees
 *      app-created files — exactly the set we want);
 *   3. create fresh with the Transactions tab.
 * Persists the ID and guarantees the header row before returning.
 */
export async function ensureSpreadsheet(): Promise<string> {
  const cached = useBackupStore.getState().spreadsheetId;
  if (cached) {
    const res = await googleApiFetch(`${SHEETS_API}/${cached}?fields=spreadsheetId`);
    if (res.ok) {
      await ensureHeader(cached);
      return cached;
    }
    if (res.status !== 404) await throwNotOk(res, 'Sheets spreadsheet lookup');
    // 404 — deleted or trashed remotely: fall through to find/create.
  }

  const q = `name='${SPREADSHEET_TITLE}' and mimeType='${SHEETS_MIME}' and trashed=false`;
  const findRes = await googleApiFetch(
    `${DRIVE_FILES_API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name)')}`,
  );
  if (!findRes.ok) await throwNotOk(findRes, 'Drive spreadsheet search');
  const found = (await findRes.json()) as { files?: { id: string; name: string }[] };
  let spreadsheetId = found.files?.[0]?.id;

  if (!spreadsheetId) {
    const createRes = await googleApiFetch(SHEETS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: SPREADSHEET_TITLE },
        sheets: [{ properties: { title: SHEET_TAB } }],
      }),
    });
    if (!createRes.ok) await throwNotOk(createRes, 'Sheets spreadsheet create');
    const created = (await createRes.json()) as { spreadsheetId?: string };
    if (!created.spreadsheetId) {
      throw new Error('Sheets spreadsheet create returned no spreadsheetId');
    }
    spreadsheetId = created.spreadsheetId;
  }

  useBackupStore.getState().setSpreadsheetId(spreadsheetId);
  await ensureHeader(spreadsheetId);
  return spreadsheetId;
}

/**
 * Append every personal-mode transaction not already in the sheet.
 * Returns how many rows were confirmed appended (0 when already up to date).
 */
export async function syncTransactions(): Promise<{ appended: number }> {
  const spreadsheetId = await ensureSpreadsheet();

  // Read back the remote ID column — ground truth for dedupe.
  const idsRes = await googleApiFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encRange(`${SHEET_TAB}!A2:A`)}`,
  );
  if (!idsRes.ok) await throwNotOk(idsRes, 'Sheets ID read-back');
  const idsData = (await idsRes.json()) as { values?: string[][] };
  const remoteIds = (idsData.values ?? [])
    .map((r) => r[0])
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const currency = useSettingsStore.getState().currency;
  const { syncedSheetIds } = useBackupStore.getState();
  const walletNameById = new Map(useWalletStore.getState().wallets.map((w) => [w.id, w.name]));

  const personal = usePersonalStore
    .getState()
    .transactions.filter(
      (t) => (t.mode ?? 'personal') === 'personal' && (t.type === 'expense' || t.type === 'income'),
    );

  const pendingIds = new Set(
    filterUnsyncedTransactionIds(personal.map((t) => t.id), remoteIds, syncedSheetIds),
  );
  const entries = personal
    .filter((t) => pendingIds.has(t.id))
    .map((t) => ({
      id: t.id,
      row: transactionToSheetRow(t, {
        currency,
        walletName: t.walletId ? walletNameById.get(t.walletId) : undefined,
      }),
    }));
  if (entries.length === 0) return { appended: 0 };

  let appended = 0;
  const appendUrl =
    `${SHEETS_API}/${spreadsheetId}/values/${encRange(`${SHEET_TAB}!A:I`)}:append` +
    '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  for (const chunk of chunkArray(entries, SHEETS_APPEND_CHUNK)) {
    const res = await googleApiFetch(appendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: chunk.map((e) => e.row),
      }),
    });
    if (!res.ok) await throwNotOk(res, 'Sheets append');
    // Confirmed 200 — only now record the IDs as synced.
    useBackupStore.getState().addSyncedSheetIds(chunk.map((e) => e.id));
    appended += chunk.length;
  }
  return { appended };
}

/**
 * Manual recovery: wipe every data row (header + schema marker in row 1 are
 * kept), forget local sync bookkeeping, then re-append everything. This is the
 * "Full re-sync" button path for a sheet the user mangled or when append-only
 * drift (edits/deletes) needs a rebuild.
 */
export async function fullResyncTransactions(): Promise<{ appended: number }> {
  const spreadsheetId = await ensureSpreadsheet();
  const res = await googleApiFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encRange(`${SHEET_TAB}!A2:K`)}:clear`,
    { method: 'POST' },
  );
  if (!res.ok) await throwNotOk(res, 'Sheets clear');
  useBackupStore.getState().resetSyncedSheetIds();
  return syncTransactions();
}

/**
 * cloudBackupQueue processor for kind 'sheet-rows'. Errors propagate so the
 * queue's retry/cooldown/failed-list bookkeeping can do its job.
 */
export async function processSheetSyncJob(): Promise<void> {
  await syncTransactions();
}
