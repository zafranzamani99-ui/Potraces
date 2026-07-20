#!/usr/bin/env python3
"""
Builds the "Potraces Quick Log" Apple Shortcut as a plist, ready for signing.

Why a script: iCloud share links are immutable snapshots (new URL every re-share),
but a SIGNED .shortcut file hosted at a stable URL can be re-generated and
re-uploaded in place. This script is the source of truth; the pipeline is:

    python3 scripts/build-quick-log-shortcut.py            # -> shortcut/PotracesQuickLog-unsigned.shortcut
    plutil -lint shortcut/PotracesQuickLog-unsigned.shortcut
    shortcuts sign --mode anyone \
        -i shortcut/PotracesQuickLog-unsigned.shortcut \
        -o "shortcut/Potraces Quick Log.shortcut"
    npx supabase storage cp "shortcut/Potraces Quick Log.shortcut" \
        ss:///web/PotracesQuickLog.shortcut --experimental

NOTE: `shortcuts sign` routes on the INPUT FILE EXTENSION — it must be
.shortcut or .wflow; a .plist extension fails with "isn't in the correct
format" no matter the contents.

Shortcut behaviour (all native Shortcuts actions, no third-party deps):
  1. Get File "potraces-key.txt". If no value (first run): Get Clipboard ->
     Ask (clipboard PRE-FILLED, user just taps Done) -> variable only.
     Otherwise: variable = file. The key is persisted ONLY after the server
     accepts it (success branch), so clipboard garbage never gets stored.
  2. Ask amount (number) -> FETCH the user's real categories (POST {key,
     action:'categories'} — app uploads labels to quick_log_prefs; server
     falls back to the default set) -> choose category -> FETCH the user's
     real wallets (POST {key, action:'wallets'}) -> choose payment -> ask note.
  3. POST JSON {key, amount, category, wallet, note} to the quick-log function.
     Offline: this aborts the shortcut (visible iOS error) — no silent loss,
     no duplicate risk. Offline retry is deferred (needs server idempotency).
  4. If the response has no "ok": warn + self-heal a revoked key (delete the
     saved key file so the next run re-asks). Otherwise show a confirmation
     card (amount · category · wallet) and save the now-validated key; the
     Potraces push is the secondary "it's in your app" confirmation.

Category labels may carry emoji; the app's resolveCategory() strips
non-alphanumerics, so "🍔 Food & Dining" still matches the food category.
"""
import plistlib
import uuid
import pathlib

ENDPOINT = "https://jngmanwvhbpkpkeklfiv.supabase.co/functions/v1/quick-log"
KEY_FILE = "potraces-key.txt"
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "shortcut"

# Pickers are NOT static lists — the Shortcut fetches the user's REAL
# categories ({key, action:'categories'}) and wallets ({key, action:'wallets'})
# live from the endpoint. The server-side DEFAULT_CATEGORIES (in
# supabase/functions/quick-log/index.ts) is the fallback set when the user
# hasn't uploaded their own labels yet.

OBJ = "￼"  # object-replacement char used by WFTextTokenString attachments


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


# Action-output UUIDs (declared on the producing action, referenced by consumers)
U_GETFILE = new_uuid()
U_CLIP = new_uuid()
U_ASKKEY = new_uuid()
U_AMT = new_uuid()
U_CATRESP = new_uuid()
U_CATLIST = new_uuid()
U_CAT = new_uuid()
U_WALRESP = new_uuid()
U_WALLETS = new_uuid()
U_WAL = new_uuid()
U_NOTE = new_uuid()
U_RESP = new_uuid()
U_OK = new_uuid()
G_FIRSTRUN = new_uuid()  # GroupingIdentifier: first-run key bootstrap If/Otherwise
G_RESULT = new_uuid()    # GroupingIdentifier: success/failure If/Otherwise
G_HEAL = new_uuid()      # GroupingIdentifier: guarded stale-key delete (file may not exist)

VAR_KEY = "PotracesKey"


def action(identifier: str, params: dict) -> dict:
    return {
        "WFWorkflowActionIdentifier": identifier,
        "WFWorkflowActionParameters": params,
    }


def out_ref(output_uuid: str, output_name: str) -> dict:
    """Bare reference to another action's output (attachment Value)."""
    return {"Type": "ActionOutput", "OutputUUID": output_uuid, "OutputName": output_name}


def var_ref(name: str) -> dict:
    """Bare reference to a named variable (attachment Value)."""
    return {"Type": "Variable", "VariableName": name}


def token_attachment(value: dict) -> dict:
    """A standalone variable/output reference parameter."""
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": value}


def token_string(parts) -> dict:
    """
    Interpolated string parameter. `parts` is a list of str literals and
    attachment Value dicts; attachments become U+FFFC placeholders with
    attachmentsByRange entries keyed by "{offset, 1}".
    """
    text = ""
    attachments = {}
    offset = 0  # in UTF-16 code units — Shortcuts ranges are NSString-based
    for part in parts:
        if isinstance(part, str):
            text += part
            offset += len(part.encode("utf-16-le")) // 2
        else:
            attachments["{%d, 1}" % offset] = part
            text += OBJ
            offset += 1
    value: dict = {"string": text}
    if attachments:
        value["attachmentsByRange"] = attachments
    return {"WFSerializationType": "WFTextTokenString", "Value": value}


def dict_item(key: str, value_parts) -> dict:
    """One WFDictionaryFieldValueItems entry (text item, WFItemType 0)."""
    return {
        "WFItemType": 0,
        "WFKey": token_string([key]),
        "WFValue": token_string(value_parts),
    }


def conditional(group: str, mode: int, extra: dict = None) -> dict:
    params = {"GroupingIdentifier": group, "WFControlFlowMode": mode}
    if extra:
        params.update(extra)
    return action("is.workflow.actions.conditional", params)


actions = [
    # ── Key bootstrap ─────────────────────────────────────────────────────────
    # 1. Try the saved key file (no picker, no error when missing).
    action("is.workflow.actions.documentpicker.open", {
        "UUID": U_GETFILE,
        "WFShowFilePicker": False,
        "WFGetFilePath": KEY_FILE,
        "WFFileErrorIfNotFound": False,
    }),
    # 2. If <file> has no value  → first run
    conditional(G_FIRSTRUN, 0, {
        "WFCondition": 101,  # "does not have any value"
        "WFInput": {
            "Type": "Variable",
            "Variable": token_attachment(out_ref(U_GETFILE, "File")),
        },
    }),
    #    Get Clipboard (the user just tapped "Copy key" in Potraces)…
    action("is.workflow.actions.getclipboard", {"UUID": U_CLIP}),
    #    …ask for the key with the clipboard pre-filled — user just taps Done.
    #    NOT saved yet: only a key the server has ACCEPTED gets persisted (the
    #    success branch below), so clipboard garbage can never wedge itself in.
    action("is.workflow.actions.ask", {
        "UUID": U_ASKKEY,
        "WFAskActionPrompt": "Your Potraces Quick Log key (tap Copy key in Potraces → Settings → Quick Log first)",
        "WFInputType": "Text",
        "WFAskActionDefaultAnswer": token_string([out_ref(U_CLIP, "Clipboard")]),
    }),
    action("is.workflow.actions.setvariable", {
        "WFVariableName": VAR_KEY,
        "WFInput": token_attachment(out_ref(U_ASKKEY, "Provided Input")),
    }),
    # Otherwise → returning run: key comes from the saved file.
    conditional(G_FIRSTRUN, 1),
    action("is.workflow.actions.setvariable", {
        "WFVariableName": VAR_KEY,
        "WFInput": token_attachment(out_ref(U_GETFILE, "File")),
    }),
    conditional(G_FIRSTRUN, 2),

    # ── Collect the entry ────────────────────────────────────────────────────
    action("is.workflow.actions.ask", {
        "UUID": U_AMT,
        "WFAskActionPrompt": "Amount (RM)",
        "WFInputType": "Number",
    }),
    # Category picker = the user's REAL categories, fetched live from the
    # endpoint (the app uploads labels to quick_log_prefs; renames + customs
    # included). The server returns the DEFAULT set (mirrored in
    # quick-log/index.ts) when nothing is uploaded yet, so the picker is never
    # empty. Offline aborts here — same failure semantics as the wallets fetch.
    action("is.workflow.actions.downloadurl", {
        "UUID": U_CATRESP,
        "WFURL": ENDPOINT,
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "JSON",
        "WFJSONValues": {
            "WFSerializationType": "WFDictionaryFieldValue",
            "Value": {
                "WFDictionaryFieldValueItems": [
                    dict_item("key", [var_ref(VAR_KEY)]),
                    dict_item("action", ["categories"]),
                ],
            },
        },
    }),
    action("is.workflow.actions.getvalueforkey", {
        "UUID": U_CATLIST,
        "WFInput": token_attachment(out_ref(U_CATRESP, "Contents of URL")),
        "WFDictionaryKey": "categories",
    }),
    action("is.workflow.actions.choosefromlist", {
        "UUID": U_CAT,
        "WFChooseFromListActionPrompt": "Category",
        "WFInput": token_attachment(out_ref(U_CATLIST, "Dictionary Value")),
    }),
    # Payment picker = the user's REAL wallets, fetched live from the endpoint
    # (default-first). The server returns a generic Cash/Bank/E-wallet/Credit
    # list when the user has no wallets yet, so the picker is never empty.
    # Offline aborts here (before the POST) — offline logging is unsupported
    # anyway, so failing at the picker is no worse than failing at the send.
    action("is.workflow.actions.downloadurl", {
        "UUID": U_WALRESP,
        "WFURL": ENDPOINT,
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "JSON",
        "WFJSONValues": {
            "WFSerializationType": "WFDictionaryFieldValue",
            "Value": {
                "WFDictionaryFieldValueItems": [
                    dict_item("key", [var_ref(VAR_KEY)]),
                    dict_item("action", ["wallets"]),
                ],
            },
        },
    }),
    action("is.workflow.actions.getvalueforkey", {
        "UUID": U_WALLETS,
        "WFInput": token_attachment(out_ref(U_WALRESP, "Contents of URL")),
        "WFDictionaryKey": "wallets",
    }),
    action("is.workflow.actions.choosefromlist", {
        "UUID": U_WAL,
        "WFChooseFromListActionPrompt": "Payment",
        "WFInput": token_attachment(out_ref(U_WALLETS, "Dictionary Value")),
    }),
    action("is.workflow.actions.ask", {
        "UUID": U_NOTE,
        "WFAskActionPrompt": "Note (optional — tap Done to skip)",
        "WFInputType": "Text",
        "WFAskActionDefaultAnswer": token_string([""]),
    }),

    # ── Send ─────────────────────────────────────────────────────────────────
    # No offline write-ahead: an offline back-tap aborts here and fails
    # VISIBLY (iOS shows a Shortcuts error) — honest, and with zero risk of the
    # duplicate-transaction hazard a naive retry would introduce. Offline retry
    # is a future enhancement that needs server-side idempotency first.
    action("is.workflow.actions.downloadurl", {
        "UUID": U_RESP,
        "WFURL": ENDPOINT,
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "JSON",
        "WFJSONValues": {
            "WFSerializationType": "WFDictionaryFieldValue",
            "Value": {
                "WFDictionaryFieldValueItems": [
                    dict_item("key", [var_ref(VAR_KEY)]),
                    dict_item("amount", [out_ref(U_AMT, "Provided Input")]),
                    dict_item("category", [out_ref(U_CAT, "Chosen Item")]),
                    dict_item("wallet", [out_ref(U_WAL, "Chosen Item")]),
                    dict_item("note", [out_ref(U_NOTE, "Provided Input")]),
                ],
            },
        },
    }),
    # On success the Shortcut shows a confirmation card (below) AND the Potraces
    # push arrives (tappable → the transactions list). Failure is the one case
    # the app can never announce (the server never got a valid request) — the
    # Shortcut warns instead.
    action("is.workflow.actions.getvalueforkey", {
        "UUID": U_OK,
        "WFInput": token_attachment(out_ref(U_RESP, "Contents of URL")),
        "WFDictionaryKey": "ok",
    }),
    conditional(G_RESULT, 0, {
        "WFCondition": 101,  # ok has NO value → the log FAILED (server rejected)
        "WFInput": {
            "Type": "Variable",
            "Variable": token_attachment(out_ref(U_OK, "Dictionary Value")),
        },
    }),
    action("is.workflow.actions.notification", {
        "WFNotificationActionBody": token_string([
            "⚠️ Not logged — ", out_ref(U_RESP, "Contents of URL"),
            ". Copy a fresh key in Potraces → Settings → Quick Log, then run me again.",
        ]),
    }),
    # Self-heal a REVOKED key: forget the saved key so the next run re-asks
    # (clipboard pre-filled). Guarded because on a first-run failure no key
    # file exists (keys persist only on success). WFDeleteFileConfirmDeletion
    # False = no "Delete this file?" dialog — the correct parameter (the old
    # WFDeleteImmediatelyDelete was a no-op, so deletes were popping a confirm).
    conditional(G_HEAL, 0, {
        "WFCondition": 100,  # a saved key file exists
        "WFInput": {
            "Type": "Variable",
            "Variable": token_attachment(out_ref(U_GETFILE, "File")),
        },
    }),
    action("is.workflow.actions.file.delete", {
        "WFInput": token_attachment(out_ref(U_GETFILE, "File")),
        "WFDeleteFileConfirmDeletion": False,
    }),
    conditional(G_HEAL, 2),
    # Otherwise → SUCCESS: persist the now-VALIDATED key. Saving here (not at
    # ask-time) means clipboard garbage can never wedge itself in as the key.
    conditional(G_RESULT, 1),
    action("is.workflow.actions.documentpicker.save", {
        "WFInput": {
            "WFSerializationType": "WFTextTokenAttachment",
            "Value": var_ref(VAR_KEY),
        },
        "WFAskWhereToSave": False,
        "WFFileDestinationPath": KEY_FILE,
        "WFSaveFileOverwrite": True,
    }),
    # Confirmation card (Finny-style): what was logged — amount · category · the
    # real wallet — with a single OK button. A modal Show-Alert, NOT a
    # notification, so it respects "only Potraces sends notifications". The
    # amount is the number the user typed; the wallet is the real one they picked.
    action("is.workflow.actions.alert", {
        "WFAlertActionTitle": token_string(["✅ Logged RM", out_ref(U_AMT, "Provided Input")]),
        "WFAlertActionMessage": token_string([
            out_ref(U_CAT, "Chosen Item"), "  ·  ", out_ref(U_WAL, "Chosen Item"),
        ]),
        "WFAlertActionCancelButtonShown": False,
    }),
    conditional(G_RESULT, 2),
]

workflow = {
    "WFWorkflowClientVersion": "2605.0.5",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {
        "WFWorkflowIconStartColor": 4292093695,
        "WFWorkflowIconGlyphNumber": 59446,
    },
    "WFWorkflowImportQuestions": [],
    "WFWorkflowInputContentItemClasses": [],
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowTypes": [],
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowActions": actions,
}

OUT_DIR.mkdir(exist_ok=True)
out = OUT_DIR / "PotracesQuickLog-unsigned.shortcut"
with open(out, "wb") as f:
    plistlib.dump(workflow, f, fmt=plistlib.FMT_XML)
print(f"wrote {out} ({out.stat().st_size} bytes, {len(actions)} actions)")
