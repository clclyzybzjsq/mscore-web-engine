#!/usr/bin/env python3
# Patch Qt 6.7-generated *_qmltyperegistrations.cpp files for MuseScore 4.7.4:
# - Qt 6.10's QMetaType::fromType supports Q_NAMESPACE metatypes; Qt 6.7's does
#   not. Drop every fromType line that is followed by a qmlRegisterNamespaceAnd
#   Revisions call for the same type: that call (via staticMetaObject) is the real
#   registration, so the fromType line is redundant regardless of namespace/class.
# - Ensure the ui module's IconCode namespace header is included (the 6.7
#   registrar omits it because iconcodes.h is not in the Qt6Qml SOURCES list).
import re, sys, glob, os

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'

fromtype_re = re.compile(r'^\s*QMetaType::fromType<([^>]+)>\(\)\.id\(\);\n')

patched = 0
for path in glob.glob(os.path.join(ROOT, 'src', '**', '*_qmltyperegistrations.cpp'), recursive=True):
    changed = False
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    out = []
    i = 0
    while i < len(lines):
        m = fromtype_re.match(lines[i])
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        if m and 'NamespaceAndRevisions' in nxt and m.group(1) in nxt:
            changed = True
            i += 1
            continue
        out.append(lines[i])
        i += 1
    if changed or True:
        text = ''.join(out)
        head = ''.join(out[:30])
        # ui module (path .../qml/Muse/Ui/): the registrar omits iconcodes.h
        # (its Q_NAMESPACE header is not in the qt_add_qml_module SOURCES) and
        # the local foreign.h that maps IconCode/MusicalSymbolCodes.
        if '/qml/Muse/Ui/' in path.replace('\\', '/'):
            if 'view/iconcodes.h' not in head:
                out.insert(1, '#include "view/iconcodes.h"\n')
                changed = True
            if 'IconCodeForeign' in text and '#include "foreign.h"' not in head:
                out.insert(1, '#include "foreign.h"\n')
                changed = True
        if changed:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.writelines(out)
            patched += 1
            print('patched', os.path.basename(path))

print('patched files:', patched)