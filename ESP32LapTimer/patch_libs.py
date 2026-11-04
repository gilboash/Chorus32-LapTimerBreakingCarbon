#!/usr/bin/env python3
"""Patch ESPAsyncWebServer so it builds against this project's ESP32 core.

The library's AsyncEventSource uses String(const char*, size_t) and
String::concat(const char*, size_t). Neither exists in the Arduino-ESP32 core
that platform espressif32 @ ~3.5.0 pins, so the library does not compile as
checked out, and lib_deps points at an unpinned git URL.

This was previously worked around by editing the files by hand inside
.pio/libdeps/, which is gitignored: the build only worked on a machine where
someone had already done that, and a clean clone failed. Doing it here makes
the workaround reproducible and visible.

Idempotent, so it is safe on every build. If the dependency has not been
installed yet (a genuinely clean clone), it says so and the next build picks
it up.
"""

import os

SCRIPT_DIR = os.getcwd()

# (file, original, replacement, marker)
#
# `original` must match the upstream source exactly, so that an upstream change
# which no longer needs this is reported rather than silently skipped.
#
# `marker` is the functional part of the fix, used to detect work already done.
# It is matched instead of the whole replacement because some checkouts were
# patched by hand before this script existed, with the same code but different
# surrounding comments.
PATCHES = [
    (
        "src/AsyncEventSource.h",
        "    AsyncEventSourceMessage(const char* data, size_t len) : "
        "_data(std::make_shared<String>(data, len)) {};",
        "    // Patched by patch_libs.py: this core's String has no "
        "(const char*, size_t) constructor.\n"
        "    AsyncEventSourceMessage(const char* data, size_t len) : "
        "_data(std::make_shared<String>(String(data).substring(0, len))) {};",
        "std::make_shared<String>(String(data).substring(0, len))",
    ),
    (
        "src/AsyncEventSource.cpp",
        "    str.concat(lineStart, lineEnd - lineStart);",
        "    // Patched by patch_libs.py: this core's String has no "
        "concat(const char*, size_t).\n"
        "    str += String(lineStart).substring(0, lineEnd - lineStart);",
        "str += String(lineStart).substring(0, lineEnd - lineStart);",
    ),
]


def patch_library(lib_dir):
    if not os.path.isdir(lib_dir):
        print("patch_libs.py: {} not installed yet; it will be patched on the "
              "next build".format(os.path.basename(lib_dir)))
        return

    for rel_path, original, replacement, marker in PATCHES:
        path = os.path.join(lib_dir, rel_path)
        if not os.path.isfile(path):
            print("patch_libs.py: {} missing, skipping".format(rel_path))
            continue

        with open(path) as f:
            contents = f.read()

        if marker in contents:
            continue  # already fixed, by this script or by hand
        if original not in contents:
            print("patch_libs.py: WARNING - {} does not contain the expected "
                  "code. The library changed upstream; check whether this "
                  "patch is still needed.".format(rel_path))
            continue

        with open(path, "w") as f:
            f.write(contents.replace(original, replacement))
        print("patch_libs.py: patched {}".format(rel_path))


if __name__ == "__main__" or __name__ == "SCons.Script":
    libdeps = os.environ.get("PLATFORMIO_LIBDEPS_DIR")
    env_name = None

    if __name__ == "SCons.Script":
        Import("env")  # noqa: F821 - provided by SCons
        libdeps = env.subst("$PROJECT_LIBDEPS_DIR")  # noqa: F821
        env_name = env.subst("$PIOENV")  # noqa: F821

    if libdeps is None:
        libdeps = os.path.join(SCRIPT_DIR, ".pio", "libdeps")

    targets = [os.path.join(libdeps, env_name)] if env_name else [
        os.path.join(libdeps, d) for d in os.listdir(libdeps)
    ] if os.path.isdir(libdeps) else []

    for target in targets:
        patch_library(os.path.join(target, "ESPAsyncWebServer"))
