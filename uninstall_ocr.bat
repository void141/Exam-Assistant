@echo off
echo.
echo ===========================================
echo   EXAM ASSISTANT — UNINSTALL OCR
echo ===========================================
echo.

echo [1/3] Uninstalling PaddleOCR...
pip uninstall -y paddleocr paddlex aistudio-sdk

echo [2/3] Uninstalling PaddlePaddle...
pip uninstall -y paddlepaddle

echo [3/3] Uninstalling OpenCV...
pip uninstall -y opencv-python opencv-contrib-python

echo.
echo [DONE] OCR dependencies removed.
echo.
pause
