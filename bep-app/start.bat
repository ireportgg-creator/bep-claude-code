@echo off
title 손익분기점 그래프 - 개발 서버
cd /d "%~dp0"
echo.
echo  [손익분기점 그래프] 개발 서버를 시작합니다...
echo  브라우저에서 http://localhost:5173 으로 접속하세요.
echo  같은 네트워크의 다른 PC: http://[이 PC의 IP]:5173
echo  종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
cmd /k "npm run dev"
