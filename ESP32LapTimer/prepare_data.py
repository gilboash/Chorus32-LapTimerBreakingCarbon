#!/usr/bin/env python3

import os
import re
import shutil
import subprocess
import gzip
from pathlib import Path

from argparse import ArgumentParser, RawTextHelpFormatter

import sys

SCRIPT_DIR = os.getcwd()

# constants.js used to be generated here from the #defines in Comms.cpp, for
# settings_socket.js to import as an ES module. Both are gone: the current
# pages are plain scripts that use the protocol letters directly, so the
# generated file was being shipped to SPIFFS with nothing importing it.

def generate_terser(terser_binary: str):
	# use terser if present
	if shutil.which(terser_binary) is not None or os.path.isfile(terser_binary):
		print("Using terser")
		for js_file in os.listdir("{}/data".format(SCRIPT_DIR)):
			if js_file.endswith(".js"):
				cmd = [terser_binary, "-c", "toplevel", "-m", "reserved,toplevel,eval", "-o", "{}/data/{}".format(SCRIPT_DIR, js_file), "{}/data/{}".format(SCRIPT_DIR, js_file)]
				subprocess.run(cmd)


def copy_files():
	shutil.rmtree("{}/data".format(SCRIPT_DIR), ignore_errors=True)
	shutil.copytree("{}/data_src".format(SCRIPT_DIR), "{}/data".format(SCRIPT_DIR))

# Files that must not be gzipped.
#   version.json - the firmware reads it out of SPIFFS itself
#   nosleep.mp4  - already compressed, and some older Android builds choke on
#                  a gzip-encoded media response
# handleFileRead() sniffs the gzip magic, so leaving them uncompressed serves
# them correctly too.
NO_GZIP = ("version.json", "nosleep.mp4")

def generate_gzip():
	# gzip all files
	for root, dirs, files in os.walk("{}/data".format(SCRIPT_DIR)):
		for curr_file in files:
			if curr_file in NO_GZIP:
				continue
			curr_file = "{}/{}".format(root, curr_file)
			to_compress = None
			with open(curr_file, "rb") as f:
				to_compress = f.read()
			with gzip.open(curr_file, "wb") as f:
				f.write(to_compress)


if __name__ == "__main__" or __name__ == "SCons.Script":
	home = os.path.expanduser("~")
	# home = Path.home()
	parser = ArgumentParser(formatter_class=RawTextHelpFormatter)
	parser.add_argument("--terser", dest="terser", help="Terser cmd [Default: %(default)s]", type=str, default= "{}/node_modules/terser/bin/terser".format(str(home)))
	args, unknown = parser.parse_known_args()

	copy_files()
	generate_terser(args.terser)
	generate_gzip()
