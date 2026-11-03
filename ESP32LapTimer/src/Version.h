/*
 * This file is part of Chorus32-ESP32LapTimer
 * (see https://github.com/AlessandroAU/Chorus32-ESP32LapTimer).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
#ifndef __VERSION_H__
#define __VERSION_H__

/// Firmware version of the Breaking Carbon fork. Bump this by hand; it is the
/// single source of truth. version_build.py reads it straight out of this file
/// and stamps the same string into the filesystem image, so that a timer can
/// tell whether its firmware and its web UI came from the same release.
///
/// A firmware update and a filesystem update are two separate OTA uploads, so
/// they can and do drift apart. Keep this semver.
#define FIRMWARE_VERSION "3.0.0"

/// GIT_HASH and BUILD_DATE come from src/BuildInfo.h, which version_build.py
/// regenerates on every build. It is gitignored, so fall back gracefully if
/// someone compiles this tree without the build script.
#if __has_include("BuildInfo.h")
#include "BuildInfo.h"
#endif

#ifndef GIT_HASH
#define GIT_HASH "unknown"
#endif

#ifndef BUILD_DATE
#define BUILD_DATE __DATE__
#endif

#endif // __VERSION_H__
