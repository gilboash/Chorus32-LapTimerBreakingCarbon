#!/bin/bash

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
TERSER_CMD="${HOME}/node_modules/terser/bin/terser"
cat ${SCRIPT_DIR}/src/Comms.cpp | grep "^#define" | grep "RESPONSE_\|CONTROL_\|EXTENDED_\|BINARY_" | awk '{print "export const " $2 " = " $3 ";"}' > ${SCRIPT_DIR}/data_src/constants.js

for js_file in ${SCRIPT_DIR}/data_src/*.js; do
	${TERSER_CMD} -c toplevel -m reserved,toplevel,eval -o ${SCRIPT_DIR}/data/$(basename $js_file) $js_file
done
