"""Tiny adb + uiautomator driver used to test the Android apps without touching
the screen by hand. Works on an emulator or a USB phone.

Set which device to drive (needed whenever more than one is attached):
    PowerShell:  $env:ANDROID_SERIAL = "<serial from `adb devices`>"
    bash:        export ANDROID_SERIAL=<serial>

Usage:
  adb_ui.py dump                    list visible text / content-desc, with bounds
  adb_ui.py tap "<text or desc>"    tap centre of the first match (exact match wins over substring)
  adb_ui.py tapxy X Y
  adb_ui.py type "<text>"           adb input text (spaces become %s)
  adb_ui.py key <KEYCODE>           e.g. 4 = back, 66 = enter, 67 = delete
  adb_ui.py swipe x1 y1 x2 y2 [ms]
  adb_ui.py shot [name]             screenshot -> <tempdir>/<name>.png (path is printed)
  adb_ui.py wait "<text>" [secs]    poll until text appears

Gotchas learned the hard way:
  * On Windows run it from PowerShell, or set MSYS_NO_PATHCONV=1 in Git Bash,
    otherwise "/sdcard/..." gets rewritten to a Windows path and adb fails.
  * `adb input text` types fast; multi-field OTP boxes used to drop digits.
  * Empty EditTexts do not show up in `dump` (uiautomator only lists nodes with text).
  * uiautomator cannot see inside the WebView/Leaflet map; use `tapxy` there.
  * Only use it on a phone you own and while you are not using that phone.
"""
import os
import re
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

WORK = os.path.join(tempfile.gettempdir(), "parkfnb_adb_ui")
os.makedirs(WORK, exist_ok=True)


def adb(*args):
    return subprocess.run(["adb", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")


def dump():
    adb("shell", "uiautomator", "dump", "/sdcard/w.xml")
    local = os.path.join(WORK, "now.xml")
    adb("pull", "/sdcard/w.xml", local)
    return ET.parse(local).getroot()


def centre(bounds):
    x1, y1, x2, y2 = map(int, re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds).groups())
    return (x1 + x2) // 2, (y1 + y2) // 2, (x1, y1, x2, y2)


def clean(s):
    return s.encode("ascii", "backslashreplace").decode()


def items(root):
    out = []
    for node in root.iter("node"):
        text, desc = node.attrib.get("text", ""), node.attrib.get("content-desc", "")
        if text or desc:
            out.append((clean(text), clean(desc), node.attrib["bounds"],
                        node.attrib.get("class", "").split(".")[-1],
                        node.attrib.get("clickable") == "true"))
    return out


def on_screen(bounds):
    _, cy, (x1, y1, x2, y2) = centre(bounds)
    return x2 > x1 and y2 > y1 and cy > 0 and y1 < 2250


def cmd_dump():
    for text, desc, bounds, cls, clickable in items(dump()):
        if on_screen(bounds):
            print(f"{text!r:45} | {desc!r:40} | {bounds} {cls}{' *' if clickable else ''}")


def cmd_tap(query):
    q = query.lower()
    visible = [i for i in items(dump()) if on_screen(i[2])]
    exact = [i for i in visible if q in (i[0].lower(), i[1].lower())]
    partial = [i for i in visible if q in i[0].lower() or q in i[1].lower()]
    for text, desc, bounds, _, _ in exact + partial:
        x, y, _ = centre(bounds)
        adb("shell", "input", "tap", str(x), str(y))
        print(f"tapped {text or desc!r} @ {x},{y}")
        return
    print(f"NOT FOUND: {query}")
    sys.exit(1)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    cmd = a[0]
    if cmd == "dump":
        cmd_dump()
    elif cmd == "tap":
        cmd_tap(a[1])
    elif cmd == "tapxy":
        adb("shell", "input", "tap", a[1], a[2])
    elif cmd == "type":
        adb("shell", "input", "text", a[1].replace(" ", "%s"))
    elif cmd == "key":
        adb("shell", "input", "keyevent", a[1])
    elif cmd == "swipe":
        adb("shell", "input", "swipe", *a[1:])
    elif cmd == "shot":
        name = a[1] if len(a) > 1 else "now"
        adb("shell", "screencap", "-p", "/sdcard/s.png")
        out = os.path.join(WORK, name + ".png")
        adb("pull", "/sdcard/s.png", out)
        print(out)
    elif cmd == "wait":
        end = time.time() + (float(a[2]) if len(a) > 2 else 15)
        while time.time() < end:
            if any(a[1].lower() in (t + d).lower() for t, d, *_ in items(dump())):
                print("found")
                return
            time.sleep(1)
        print("TIMEOUT")
        sys.exit(1)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
