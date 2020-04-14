#!/usr/bin/env python3

import os
import re
import shutil
import subprocess
import gzip
from pathlib import Path


SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
TERSER_CMD = "{}/node_modules/terser/bin/terser".format(str(Path.home()))

# generate constants.js file
with open("{}/src/Comms.cpp".format(SCRIPT_DIR)) as comms_file, open("{}/data_src/constants.js".format(SCRIPT_DIR), "w") as constants_file:
	regex = re.compile("#define (RESPONSE_|CONTROL_|EXTENDED_|BINARY_)")
	for line in comms_file:
		if re.match(regex, line):
			values = line.split(" ")
			values = list(filter(" ".__ne__, values))
			values = list(filter("".__ne__, values))
			values[2] = values[2].rstrip()
			constants_file.write("export const {} = {};\n".format(values[1], values[2]))


# use terser if present
if shutil.which(TERSER_CMD) is not None or os.path.isfile(TERSER_CMD):
	print("Using terser")
	for js_file in os.listdir("{}/data_src".format(SCRIPT_DIR)):
		if js_file.endswith(".js"):
			cmd = [TERSER_CMD, "-c", "toplevel", "-m", "reserved,toplevel,eval", "-o", "{}/data/{}".format(SCRIPT_DIR, js_file), "{}/data_src/{}".format(SCRIPT_DIR, js_file)]
			subprocess.run(cmd)


shutil.copytree("{}/data_src".format(SCRIPT_DIR), "{}/data".format(SCRIPT_DIR), dirs_exist_ok=True)

# gzip all files
for root, dirs, files in os.walk("{}/data".format(SCRIPT_DIR)):
	for curr_file in files:
		curr_file = "{}/{}".format(root, curr_file)
		to_compress = None
		with open(curr_file, "rb") as f:
			to_compress = f.read()
		with gzip.open(curr_file, "wb") as f:
			f.write(to_compress)
