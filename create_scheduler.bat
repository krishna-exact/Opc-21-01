@echo off
title Installing Service
schtasks /query /fo LIST /tn "OPC Connect" || schtasks /create /sc minute /mo 5 /tn "OPC Connect" /tr "C:\OPCConnect\resources\app\check_process.bat"
echo "Installed Schedular Service"
@REM pause