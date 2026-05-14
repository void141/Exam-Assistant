@echo off
echo.
echo ===========================================
echo   EXAM ASSISTANT — OCR SETUP
echo ===========================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.8+ and try again.
    pause
    exit /b 1
)

echo [1/3] Installing PaddlePaddle...
pip install paddlepaddle -i https://pypi.tuna.tsinghua.edu.cn/simple

echo [2/3] Installing PaddleOCR...
pip install paddleocr

echo [3/3] Installing OpenCV...
pip install opencv-python

echo.
echo [DONE] OCR dependencies installed successfully.
echo.
pause
