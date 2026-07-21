#!/usr/bin/env python3
"""
Builds "Potraces Auto Log" — run by a user's Apple Pay (Wallet) Transaction
automation. DUAL-MODE input (2026-07-22 redesign, competitor-parity):

  1. TRANSACTION path (the easy setup): the automation's "Do" runs THIS
     shortcut DIRECTLY (picked under "My Shortcuts" — one tap). When an
     automation runs a shortcut as its own action, the live transaction IS the
     shortcut input — the "$0 amount" bug only applies to the nested
     `Run Shortcut` ACTION hand-off, not to direct-run. The shortcut extracts
     Amount / Merchant / "Card or Pass" itself via input property
     aggrandizements, so the user builds NOTHING by hand.
  2. TEXT path (legacy fallback): old setups pass "amount|merchant|card" built
     by a Text action + Run Shortcut. Detected by the Amount property having no
     value (a plain string has no Amount) → split on "|" as before.

Both paths converge: regex-clean the amount, read the saved key file, POST to
the quick-log endpoint. HEADLESS (no prompts) — category defaults to 'other';
the user re-categorises from the confirmation push.

Requires `potraces-key.txt` to exist — the Back Tap first log saves it.

Pipeline (same as the Back Tap builder):
    python3 scripts/build-autolog-shortcut.py
    plutil -lint shortcut/PotracesAutoLog-unsigned.shortcut
    shortcuts sign --mode anyone -i shortcut/PotracesAutoLog-unsigned.shortcut \
        -o "shortcut/Potraces Auto Log.shortcut"
    npx supabase storage cp "shortcut/Potraces Auto Log.shortcut" \
        ss:///web/PotracesAutoLog.shortcut --experimental \
        --content-type application/x-apple-shortcut
"""
import plistlib
import uuid
import pathlib

ENDPOINT = "https://jngmanwvhbpkpkeklfiv.supabase.co/functions/v1/quick-log"
KEY_FILE = "potraces-key.txt"
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "shortcut"
OBJ = "￼"  # object-replacement char for WFTextTokenString attachments


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


U_SPLIT = new_uuid()
U_AMT_RAW = new_uuid()
U_AMT = new_uuid()
U_MERCH = new_uuid()
U_CARD = new_uuid()
U_KEY = new_uuid()
U_RESP = new_uuid()
U_OK = new_uuid()
G_RESULT = new_uuid()
G_MODE = new_uuid()   # transaction-vs-text input discriminator If/Otherwise

# The two paths converge into these variables before the POST.
VAR_RAWAMT = "PotracesRawAmount"
VAR_MERCHANT = "PotracesMerchant"
VAR_CARD = "PotracesCard"


def action(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def out_ref(u, name):
    return {"Type": "ActionOutput", "OutputUUID": u, "OutputName": name}


def token_attachment(value):
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": value}


def shortcut_input():
    """Reference to the shortcut's own input (the text the automation passed)."""
    return {"Type": "ExtensionInput"}


def input_prop(name):
    """Shortcut Input → <property> (e.g. the transaction's Amount) — the same
    thing the old guide had users build by double-tapping "Shortcut Input" in a
    Text action, serialized directly so the shortcut does it itself."""
    return {
        "Type": "ExtensionInput",
        "Aggrandizements": [
            {"Type": "WFPropertyVariableAggrandizement", "PropertyName": name},
        ],
    }


def var_ref(name):
    return {"Type": "Variable", "VariableName": name}


def set_var(name, value):
    return action("is.workflow.actions.setvariable", {
        "WFVariableName": name,
        "WFInput": token_attachment(value),
    })


def token_string(parts):
    text = ""
    attachments = {}
    offset = 0
    for part in parts:
        if isinstance(part, str):
            text += part
            offset += len(part.encode("utf-16-le")) // 2
        else:
            attachments["{%d, 1}" % offset] = part
            text += OBJ
            offset += 1
    value = {"string": text}
    if attachments:
        value["attachmentsByRange"] = attachments
    return {"WFSerializationType": "WFTextTokenString", "Value": value}


def dict_item(key, value_parts):
    return {"WFItemType": 0, "WFKey": token_string([key]), "WFValue": token_string(value_parts)}


def get_item(list_uuid, index):
    """Item at a 1-based index from a list."""
    return action("is.workflow.actions.getitemfromlist", {
        "WFInput": token_attachment(out_ref(list_uuid, "List")),
        "WFItemSpecifier": "Item At Index",
        "WFItemIndex": index,
    })


actions = [
    # ── Input discriminator: does the input have an Amount property? ─────────
    # A live Wallet transaction does; the legacy "amount|merchant|card" TEXT
    # does not (a string has no Amount) — so this cleanly splits the two paths.
    action("is.workflow.actions.conditional", {
        "GroupingIdentifier": G_MODE,
        "WFControlFlowMode": 0,
        "WFCondition": 100,  # "has any value"
        "WFInput": {"Type": "Variable", "Variable": token_attachment(input_prop("Amount"))},
    }),
    #   TRANSACTION path — extract the fields ourselves (user builds nothing).
    set_var(VAR_RAWAMT, input_prop("Amount")),
    set_var(VAR_MERCHANT, input_prop("Merchant")),
    set_var(VAR_CARD, input_prop("Card or Pass")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_MODE, "WFControlFlowMode": 1}),
    #   TEXT path (legacy) — the automation passed "amount|merchant|card".
    action("is.workflow.actions.text.split", {
        "UUID": U_SPLIT,
        "WFInput": token_attachment(shortcut_input()),
        "WFTextSeparator": "Custom",
        "WFTextCustomSeparator": "|",
    }),
    {**get_item(U_SPLIT, 1), "WFWorkflowActionParameters":
        {**get_item(U_SPLIT, 1)["WFWorkflowActionParameters"], "UUID": U_AMT_RAW}},
    set_var(VAR_RAWAMT, out_ref(U_AMT_RAW, "Item from List")),
    {**get_item(U_SPLIT, 2), "WFWorkflowActionParameters":
        {**get_item(U_SPLIT, 2)["WFWorkflowActionParameters"], "UUID": U_MERCH}},
    set_var(VAR_MERCHANT, out_ref(U_MERCH, "Item from List")),
    {**get_item(U_SPLIT, 3), "WFWorkflowActionParameters":
        {**get_item(U_SPLIT, 3)["WFWorkflowActionParameters"], "UUID": U_CARD}},
    set_var(VAR_CARD, out_ref(U_CARD, "Item from List")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_MODE, "WFControlFlowMode": 2}),

    # ── Converged: clean the amount ("RM12.34" / "-$12,34" → "12.34") ────────
    # Strips currency symbol AND the +/- sign, so the server's amount parser —
    # which rejects negatives — is always handed a clean positive number.
    action("is.workflow.actions.text.replace", {
        "UUID": U_AMT,
        "WFInput": token_attachment(var_ref(VAR_RAWAMT)),
        "WFReplaceTextFind": "[^0-9.,]",
        "WFReplaceTextReplace": "",
        "WFReplaceTextRegularExpression": True,
    }),
    # Key from the file the Back Tap flow saved (no picker, no error if missing).
    action("is.workflow.actions.documentpicker.open", {
        "UUID": U_KEY,
        "WFShowFilePicker": False,
        "WFGetFilePath": KEY_FILE,
        "WFFileErrorIfNotFound": False,
    }),
    # POST — category defaulted to 'other' (headless: can't ask); merchant→note,
    # card→wallet (server's resolveWallet alias-matches the card name).
    action("is.workflow.actions.downloadurl", {
        "UUID": U_RESP,
        "WFURL": ENDPOINT,
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "JSON",
        "WFJSONValues": {
            "WFSerializationType": "WFDictionaryFieldValue",
            "Value": {
                "WFDictionaryFieldValueItems": [
                    dict_item("key", [out_ref(U_KEY, "File")]),
                    dict_item("amount", [out_ref(U_AMT, "Updated Text")]),
                    dict_item("category", ["other"]),
                    dict_item("wallet", [var_ref(VAR_CARD)]),
                    dict_item("note", [var_ref(VAR_MERCHANT)]),
                ],
            },
        },
    }),
    # Failure → notification (headless-safe). Success is silent — the Potraces
    # push is the confirmation.
    action("is.workflow.actions.getvalueforkey", {
        "UUID": U_OK,
        "WFInput": token_attachment(out_ref(U_RESP, "Contents of URL")),
        "WFDictionaryKey": "ok",
    }),
    action("is.workflow.actions.conditional", {
        "GroupingIdentifier": G_RESULT,
        "WFControlFlowMode": 0,
        "WFCondition": 101,  # ok has NO value → failed
        "WFInput": {"Type": "Variable", "Variable": token_attachment(out_ref(U_OK, "Dictionary Value"))},
    }),
    action("is.workflow.actions.notification", {
        "WFNotificationActionBody": token_string([
            "⚠️ Potraces couldn’t auto-log this — set up Quick Log (Back Tap) in Potraces first so your key is saved.",
        ]),
    }),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_RESULT, "WFControlFlowMode": 2}),
]

workflow = {
    "WFWorkflowClientVersion": "2605.0.5",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59446},
    "WFWorkflowImportQuestions": [],
    # Accept plain text from the automation's "Run Shortcut" hand-off.
    "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowTypes": [],
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowActions": actions,
}

OUT_DIR.mkdir(exist_ok=True)
out = OUT_DIR / "PotracesAutoLog-unsigned.shortcut"
with open(out, "wb") as f:
    plistlib.dump(workflow, f, fmt=plistlib.FMT_XML)
print(f"wrote {out} ({out.stat().st_size} bytes, {len(actions)} actions)")
