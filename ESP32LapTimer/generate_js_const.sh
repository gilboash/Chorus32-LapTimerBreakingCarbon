#!/bin/bash

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
cat ${SCRIPT_DIR}/Comms.cpp | grep "^#define" | grep "RESPONSE_\|CONTROL_\|EXTENDED_" | awk '{print "export const " $2 " = " $3 ";"}' > ${SCRIPT_DIR}/data/constants.js
