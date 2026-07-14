#!/usr/bin/env python3
"""
Builds "Potraces Auto Log" — the HELPER shortcut called by a user's Apple Pay
(Wallet) Transaction automation. The automation reads the transaction's
Amount / Merchant / Card (via the double-tap "Shortcut Input -> property" step),
joins them with "|" in a Text action, and runs this shortcut with that text.

Why a helper (not all-in-automation): the live Transaction object does NOT
survive being passed into a called shortcut (documented "$0 amount" bug), but
plain TEXT passes reliably. So the automation extracts the three fields to text;
this shortcut (which accepts WFStringContentItem input) does the rest — split,
clean the currency amount, read the saved key, POST to the same quick-log
endpoint. Runs HEADLESS (an automation can't show interactive prompts), so it
has none — category is defaulted to 'other'; the user re-categorises in-app.

Requires the key file `potraces-key.txt` to already exist — i.e. the user set up
Back Tap first (that flow saves the key). Documented in the setup guide.

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


def action(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def out_ref(u, name):
    return {"Type": "ActionOutput", "OutputUUID": u, "OutputName": name}


def token_attachment(value):
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": value}


def shortcut_input():
    """Reference to the shortcut's own input (the text the automation passed)."""
    return {"Type": "ExtensionInput"}


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
    # The automation passes "amount|merchant|card" as the shortcut input.
    action("is.workflow.actions.text.split", {
        "UUID": U_SPLIT,
        "WFInput": token_attachment(shortcut_input()),
        "WFTextSeparator": "Custom",
        "WFTextCustomSeparator": "|",
    }),
    # amount (raw currency string, e.g. "$12.34" / "-RM12,34")
    {**get_item(U_SPLIT, 1), "WFWorkflowActionParameters":
        {**get_item(U_SPLIT, 1)["WFWorkflowActionParameters"], "UUID": U_AMT_RAW}},
    # Strip everything but digits and separators (drops currency symbol AND the
    # +/- sign, so the server's amount parser — which rejects negatives — is
    # always handed a clean positive number).
    action("is.workflow.actions.text.replace", {
        "UUID": U_AMT,
        "WFInput": token_attachment(out_ref(U_AMT_RAW, "Item from List")),
        "WFReplaceTextFind": "[^0-9.,]",
        "WFReplaceTextReplace": "",
        "WFReplaceTextRegularExpression": True,
    }),
    {**get_item(U_SPLIT, 2), "WFWorkflowActionParameters":
        {**get_item(U_SPLIT, 2)["WFWorkflowActionParameters"], "UUID": U_MERCH}},
    {**get_item(U_SPLIT, 3), "WFWorkflowActionParameters":
        {**get_item(U_SPLIT, 3)["WFWorkflowActionParameters"], "UUID": U_CARD}},
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
                    dict_item("wallet", [out_ref(U_CARD, "Item from List")]),
                    dict_item("note", [out_ref(U_MERCH, "Item from List")]),
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
