@echo off
cd /d "%~dp0"
echo افتح: http://localhost:8000
start http://localhost:8000
python -m http.server 8000 || py -m http.server 8000
