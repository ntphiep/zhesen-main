#!/bin/sh
# Entry point of the transient unit zhesen-glossfix. Stop with: systemctl stop zhesen-glossfix
. /opt/zhesen/learner/env.sh
cd /opt/zhesen/glossfix
exec python3 glossfix.py run --workers 4 --phases A,B,C,D,E,F --guard
