#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# M2-A build: MuseScore 4.7.4 WebAssembly (Track A) on Windows via git-bash.
# Locally mirrors buildscripts/ci/wasm/build.sh, minus its git/apt dependencies
# (this source tree is a zip extract, not a git checkout). Qt requirement was
# downgraded 6.8 -> 6.7 in buildscripts/cmake/SetupQt6.cmake (backup .orig-qt68)
# because the Qt online repo no longer ships 6.8+/6.10 wasm packages.
set -euo pipefail

SRC="/d/dsh-musescore-plugin/mscz_source_code/MuseScore-4.7.4/MuseScore-4.7.4"
EMSDK="/d/dsh-musescore-plugin/emsdk"
QT_WASM="${QT_WASM:-/d/dsh-musescore-plugin/qt/6.7.3/wasm_singlethread}"
JOBS="${JOBS:-6}"
BUILD_DIR="${BUILD_DIR:-build.release}"

if [ ! -f "$EMSDK/emsdk_env.sh" ]; then echo "emsdk missing at $EMSDK"; exit 1; fi
if [ ! -f "$QT_WASM/lib/cmake/Qt6/qt.toolchain.cmake" ]; then
  echo "Qt wasm toolchain missing at $QT_WASM"; exit 1
fi

export PATH="$EMSDK:$PATH"
# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
echo "emcc: $(command -v emcc) $(emcc --version 2>&1 | grep -i emscripten | head -1)"

cd "$SRC"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

cmake .. -GNinja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="$QT_WASM/lib/cmake/Qt6/qt.toolchain.cmake" \
  -DMUSESCORE_BUILD_CONFIGURATION=app-web \
  -DMUSE_APP_BUILD_MODE=dev \
  -DCMAKE_BUILD_NUMBER=0 \
  -DMUSESCORE_REVISION=local \
  -DMUE_RUN_LRELEASE=ON \
  -DMUE_DOWNLOAD_SOUNDFONT=OFF \
  -DMUE_BUILD_IMPEXP_MNX_MODULE=OFF \
  -DMUSE_MODULE_VST=OFF \
  -DMUSE_MODULE_NETWORK_WEBSOCKET=OFF \
  -DMUSE_MODULE_AUDIO_PIPEWIRE=OFF \
  -DMUSE_MODULE_DIAGNOSTICS_CRASHPAD_CLIENT=OFF \
  -DMUSE_ENABLE_UNIT_TESTS=OFF \
  -DMUSE_COMPILE_USE_UNITY=ON

echo "=== ninja -j $JOBS ==="
ninja -j "$JOBS"
echo "=== MuseScore wasm build finished ==="