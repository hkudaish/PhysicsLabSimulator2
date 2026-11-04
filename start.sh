#!/bin/sh
cd "$(dirname "$0")"
echo "افتح: http://localhost:8000"
(python3 -m http.server 8000 || python -m http.server 8000)
