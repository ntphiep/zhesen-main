#!/bin/sh
# Entry point of the transient unit zhesen-learner. Stop with: systemctl stop zhesen-learner
# Extra arguments go to `learner.py run`, e.g. --redo same-family.
. /opt/zhesen/learner/env.sh
set -a; . /opt/zhesen/batch.env; set +a
cd /opt/zhesen/learner
exec python3 learner.py run --workers 12 "$@"
