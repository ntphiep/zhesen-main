#!/bin/sh
# Entry point of the transient unit zhesen-glossfix. Stop with: systemctl stop zhesen-glossfix
. /opt/zhesen/learner/env.sh
cd /opt/zhesen/glossfix
exec python3 glossfix.py run --models omni:agy/gpt-oss-120b-medium --workers 2 --phases A,B,C,D,E,F --guard
