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

Both paths converge, then the amount is resolved in up to FIVE layers
(2026-07-24 rebuild — device evidence: the Amount property arrived digitless
on current iOS, server echoed got:"", while Merchant survived): Get Numbers
from the raw Amount property (2026-07-30 — reads the number out of the typed
currency value, bypassing the coercion that nulls it) → regex-clean the
property → clean an explicit Text-action rendering of the property →
decimal-pattern match on the transaction's raw text form → Ask once (Number
keyboard). Category defaults to 'other'; the user re-categorises from the
confirmation push. Layer 4 means a log is NEVER silently lost again.

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
U_MERCH = new_uuid()
U_CARD = new_uuid()
U_CLEAN1 = new_uuid()
U_TEXT2 = new_uuid()
U_CLEAN2 = new_uuid()
U_RAWTEXT = new_uuid()
U_MATCH = new_uuid()
U_MATCH1 = new_uuid()
U_ASK = new_uuid()
U_KEY = new_uuid()
U_RESP = new_uuid()
U_OK = new_uuid()
G_RESULT = new_uuid()
G_MODE = new_uuid()   # transaction-vs-text input discriminator If/Otherwise
G_AMT1 = new_uuid()   # amount layer 1 (cleaned property) If/Otherwise
G_AMT2 = new_uuid()   # amount layer 2 (Text-action coercion) If/Otherwise
G_AMT3 = new_uuid()   # amount layer 3 (decimal match in raw text) If/Otherwise
G_AMT0 = new_uuid()   # amount layer 0 (Get Numbers from Input) If/Otherwise
U_GETNUM = new_uuid()
U_GETNUM_CLEAN = new_uuid()
U_GETNUM_MATCH = new_uuid()

# The two paths converge into these variables before the POST.
VAR_RAWAMT = "PotracesRawAmount"
VAR_MERCHANT = "PotracesMerchant"
VAR_CARD = "PotracesCard"
VAR_FINALAMT = "PotracesFinalAmount"


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

    # ── Converged: resolve the amount, LAYERED (2026-07-24 rebuild) ──────────
    # Device evidence (RM3.80 @ 7-Eleven, server echoed got:""): the Amount
    # PROPERTY arrives digitless through Set Variable → Replace Text — the
    # value dies in that coercion on current iOS, while Merchant (a text
    # property) survives fine. So the amount is resolved in five layers (layer 0
    # below is tried FIRST); the first to produce digits wins, last never fails silently:
    #   1. regex-clean the property value (the pre-2026-07-24 behavior)
    #   2. route the property through an explicit Text action first — numbers
    #      and currency measurements render properly THERE — then clean
    #   3. decimal-pattern match ([0-9]+[.,][0-9]{2}) on the transaction's raw
    #      text form — the decimal is REQUIRED, so merchant digits
    #      ("1274-7-Eleven") can never become a garbage amount
    #   4. Ask once (Number keyboard) — iOS hid the amount, the user types it.
    #      The log ALWAYS lands; silent data loss becomes impossible.
    # ── Amount layer 0 (2026-07-30): Get Numbers from Input ──────────────────
    # Root cause found: the Amount is a currency-TYPED value (symbol + locale
    # format), not a plain number. Feeding it through Set Variable / Replace
    # Text nulls it on current iOS (that's the got:"" evidence above). "Get
    # Numbers from Input" read STRAIGHT off the raw input property — NOT
    # VAR_RAWAMT, which is already the coerced-dead copy — pulls the number out
    # of the typed value, which is the recipe every working Apple Pay expense
    # shortcut uses. Guarded by a [1-9] match: Get Numbers can yield 0/empty on
    # a genuine miss, and this guarantees such a miss falls through to layers
    # 1-4 (→ Ask) instead of silently posting RM0. Tried first; if it lands the
    # amount we're done, otherwise behaviour is identical to before.
    action("is.workflow.actions.detect.number", {
        "UUID": U_GETNUM,
        "WFInput": token_attachment(input_prop("Amount")),
    }),
    action("is.workflow.actions.text.replace", {
        "UUID": U_GETNUM_CLEAN,
        "WFInput": token_attachment(out_ref(U_GETNUM, "Number")),
        "WFReplaceTextFind": "[^0-9.]",
        "WFReplaceTextReplace": "",
        "WFReplaceTextRegularExpression": True,
    }),
    action("is.workflow.actions.text.match", {
        "UUID": U_GETNUM_MATCH,
        "WFMatchText": token_attachment(out_ref(U_GETNUM_CLEAN, "Updated Text")),
        "WFMatchTextPattern": "[1-9]",
        "WFMatchTextCaseSensitive": False,
    }),
    action("is.workflow.actions.conditional", {
        "GroupingIdentifier": G_AMT0,
        "WFControlFlowMode": 0,
        "WFCondition": 100,  # a non-zero digit exists → a real amount came through
        "WFInput": {"Type": "Variable", "Variable": token_attachment(out_ref(U_GETNUM_MATCH, "Matches"))},
    }),
    set_var(VAR_FINALAMT, out_ref(U_GETNUM_CLEAN, "Updated Text")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT0, "WFControlFlowMode": 1}),
    action("is.workflow.actions.text.replace", {
        "UUID": U_CLEAN1,
        "WFInput": token_attachment(var_ref(VAR_RAWAMT)),
        "WFReplaceTextFind": "[^0-9.,]",
        "WFReplaceTextReplace": "",
        "WFReplaceTextRegularExpression": True,
    }),
    action("is.workflow.actions.conditional", {
        "GroupingIdentifier": G_AMT1,
        "WFControlFlowMode": 0,
        "WFCondition": 100,  # cleaned property has digits → done
        "WFInput": {"Type": "Variable", "Variable": token_attachment(out_ref(U_CLEAN1, "Updated Text"))},
    }),
    set_var(VAR_FINALAMT, out_ref(U_CLEAN1, "Updated Text")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT1, "WFControlFlowMode": 1}),
    action("is.workflow.actions.gettext", {
        "UUID": U_TEXT2,
        "WFTextActionText": token_string([var_ref(VAR_RAWAMT)]),
    }),
    action("is.workflow.actions.text.replace", {
        "UUID": U_CLEAN2,
        "WFInput": token_attachment(out_ref(U_TEXT2, "Text")),
        "WFReplaceTextFind": "[^0-9.,]",
        "WFReplaceTextReplace": "",
        "WFReplaceTextRegularExpression": True,
    }),
    action("is.workflow.actions.conditional", {
        "GroupingIdentifier": G_AMT2,
        "WFControlFlowMode": 0,
        "WFCondition": 100,
        "WFInput": {"Type": "Variable", "Variable": token_attachment(out_ref(U_CLEAN2, "Updated Text"))},
    }),
    set_var(VAR_FINALAMT, out_ref(U_CLEAN2, "Updated Text")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT2, "WFControlFlowMode": 1}),
    action("is.workflow.actions.gettext", {
        "UUID": U_RAWTEXT,
        "WFTextActionText": token_string([shortcut_input()]),
    }),
    action("is.workflow.actions.text.match", {
        "UUID": U_MATCH,
        "WFMatchText": token_attachment(out_ref(U_RAWTEXT, "Text")),
        "WFMatchTextPattern": "[0-9]+[.,][0-9]{2}",
        "WFMatchTextCaseSensitive": False,
    }),
    action("is.workflow.actions.conditional", {
        "GroupingIdentifier": G_AMT3,
        "WFControlFlowMode": 0,
        "WFCondition": 100,  # a decimal-looking match exists (empty list → Otherwise)
        "WFInput": {"Type": "Variable", "Variable": token_attachment(out_ref(U_MATCH, "Matches"))},
    }),
    {**get_item(U_MATCH, 1), "WFWorkflowActionParameters":
        {**get_item(U_MATCH, 1)["WFWorkflowActionParameters"], "UUID": U_MATCH1}},
    set_var(VAR_FINALAMT, out_ref(U_MATCH1, "Item from List")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT3, "WFControlFlowMode": 1}),
    action("is.workflow.actions.ask", {
        "UUID": U_ASK,
        "WFAskActionPrompt": "Amount (RM)? iOS hid it from Auto Log — type it once.",
        "WFInputType": "Number",
    }),
    set_var(VAR_FINALAMT, out_ref(U_ASK, "Provided Input")),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT3, "WFControlFlowMode": 2}),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT2, "WFControlFlowMode": 2}),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT1, "WFControlFlowMode": 2}),
    action("is.workflow.actions.conditional", {"GroupingIdentifier": G_AMT0, "WFControlFlowMode": 2}),
    # Key from the file the Back Tap flow saved (no picker, no error if missing).
    action("is.workflow.actions.documentpicker.open", {
        "UUID": U_KEY,
        "WFShowFilePicker": False,
        "WFGetFilePath": KEY_FILE,
        "WFFileErrorIfNotFound": False,
    }),
    # POST — category defaulted to 'other' (headless: can't ask); merchant→note,
    # card→wallet (server's resolveWallet alias-matches the card name). Amount
    # is the LAYER-RESOLVED final value (see above), never the raw property.
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
                    dict_item("amount", [var_ref(VAR_FINALAMT)]),
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
    # Body includes the server's response so failures are diagnosable
    # (missing-key vs bad-amount vs invalid-key). Since 2026-07-24 it also
    # echoes the RAW extraction state — amt = the Amount property as iOS
    # handed it over, raw = the transaction's text form — so a single
    # screenshot shows exactly which layer broke. (raw is empty unless the
    # layer-3 branch ran; Shortcuts renders unrun magic variables as empty.)
    action("is.workflow.actions.notification", {
        "WFNotificationActionBody": token_string([
            "⚠️ Potraces couldn’t auto-log (", out_ref(U_RESP, "Contents of URL"),
            "). Screenshot this for support — amt='", var_ref(VAR_RAWAMT),
            "' raw='", out_ref(U_RAWTEXT, "Text"), "'. Or do ONE Back Tap log.",
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
    # NO input-class restriction (2026-07-22, device-verified failure): declaring
    # ["WFStringContentItem"] renders as "Receive Text" and makes iOS COERCE the
    # live Wallet transaction to a plain string before the first action runs —
    # which strips the Amount/Merchant/Card properties, so the transaction path's
    # "If Amount has any value" NEVER matched and every direct-run tap fell into
    # the legacy split-on-"|" path with a garbage amount (server: bad-amount).
    # With no declared classes the input arrives untyped: transactions keep their
    # properties, and legacy text hand-offs still read as text.
    "WFWorkflowInputContentItemClasses": [],
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
