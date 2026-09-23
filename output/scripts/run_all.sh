#!/bin/bash
cd /tmp/upscale/work
for m in "$@"; do
  echo "START $m $(date +%T)"
  /tmp/upscale/venv/bin/python run_model.py "$m" 448 48 > "/tmp/upscale/out/$m.stdout" 2>&1
  echo "END $m rc=$? $(date +%T)"
done
echo "ALLDONE $(date +%T)"
