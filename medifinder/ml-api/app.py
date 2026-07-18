from flask import Flask, request, jsonify
import joblib
import os
import re

app = Flask(__name__)

# ── Load model and vectorizer once at startup ─────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model      = joblib.load(os.path.join(BASE_DIR, 'model.pkl'))
vectorizer = joblib.load(os.path.join(BASE_DIR, 'vectorizer.pkl'))

print("ML model loaded and ready.")

# ── Import OCR dependencies (with helpful error if not installed) ──────────────
try:
    import pytesseract
    from PIL import Image
    import io
    import platform

    # Auto-detect Tesseract binary path per OS
    system = platform.system()
    if system == "Windows":
        import shutil
        # Try default Windows install location first
        win_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        # Also check PATH
        path_bin = shutil.which("tesseract")
        if path_bin:
            pytesseract.pytesseract.tesseract_cmd = path_bin
            print(f"Tesseract found on PATH: {path_bin}")
        else:
            for p in win_paths:
                if os.path.isfile(p):
                    pytesseract.pytesseract.tesseract_cmd = p
                    print(f"Tesseract found at: {p}")
                    break
            else:
                raise EnvironmentError(
                    "Tesseract binary not found.\n"
                    "Windows fix: Download from https://github.com/UB-Mannheim/tesseract/wiki\n"
                    "Then add its folder to your PATH, or set pytesseract.pytesseract.tesseract_cmd manually."
                )
    elif system == "Darwin":
        # macOS — Homebrew default
        import shutil
        mac_paths = [
            "/opt/homebrew/bin/tesseract",   # Apple Silicon
            "/usr/local/bin/tesseract",       # Intel Mac
        ]
        path_bin = shutil.which("tesseract")
        if path_bin:
            pytesseract.pytesseract.tesseract_cmd = path_bin
        else:
            for p in mac_paths:
                if os.path.isfile(p):
                    pytesseract.pytesseract.tesseract_cmd = p
                    break
            else:
                raise EnvironmentError(
                    "Tesseract not found.\nmacOS fix: brew install tesseract"
                )
    # Linux: tesseract is usually on PATH already; no extra config needed

    # Quick sanity check
    pytesseract.get_tesseract_version()
    OCR_AVAILABLE = True
    print(f"OCR (pytesseract + Pillow) ready. Tesseract: {pytesseract.get_tesseract_version()}")

except EnvironmentError as e:
    OCR_AVAILABLE = False
    print(f"WARNING: Tesseract binary missing — {e}")
except ImportError as e:
    OCR_AVAILABLE = False
    print(f"WARNING: OCR Python packages missing — {e}\nRun: pip install pytesseract Pillow")
except Exception as e:
    OCR_AVAILABLE = False
    print(f"WARNING: OCR unavailable — {e}")

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'service': 'MediFinder ML API',
        'status':  'running',
        'ocr':     'available' if OCR_AVAILABLE else 'unavailable',
        'endpoints': {
            'POST /predict': 'Predict medicine from symptom',
            'POST /scan':    'Extract text from medicine label image (OCR)'
        }
    })

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()

    if not data or 'symptom' not in data:
        return jsonify({'error': 'Please provide a "symptom" field in the request body'}), 400

    symptom = str(data['symptom']).strip()
    if not symptom:
        return jsonify({'error': 'Symptom cannot be empty'}), 400

    vec      = vectorizer.transform([symptom])
    medicine = model.predict(vec)[0]
    proba    = model.predict_proba(vec).max()

    return jsonify({
        'symptom':    symptom,
        'medicine':   medicine,
        'confidence': round(float(proba), 4)
    })

@app.route('/scan', methods=['POST'])
def scan():
    if not OCR_AVAILABLE:
        return jsonify({'error': 'OCR service is not available on this server'}), 503

    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided. Send a file under the "image" field'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    try:
        image_bytes = file.read()
        image = Image.open(io.BytesIO(image_bytes))

        # Convert to RGB if needed (handles PNG with alpha, etc.)
        if image.mode not in ('RGB', 'L'):
            image = image.convert('RGB')

        # Run OCR — use config for better single-line medicine label recognition
        raw_text = pytesseract.image_to_string(
            image,
            config='--psm 6'   # Assume uniform block of text
        )

        # Clean: strip extra whitespace and blank lines
        lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
        cleaned_text = ' '.join(lines)

        if not cleaned_text:
            return jsonify({
                'text':     '',
                'detected': False,
                'message':  'No text detected in image'
            })

        return jsonify({
            'text':     cleaned_text,
            'detected': True
        })

    except Exception as e:
        return jsonify({'error': f'OCR processing failed: {str(e)}'}), 500

# ── Start server ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
