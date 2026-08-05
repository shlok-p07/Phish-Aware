# PhishAware ML Service (FastAPI)

A separate Python service for model/dataset work — phishing-likelihood
scoring and whatever else comes out of future ML work. This is **not** part
of the Next.js app (`../src/app/api`); it's its own deployable, its own
dependencies, its own lifecycle. The Next.js app is expected to call this
service over HTTP once it exists in production, the same way any external
API would be consumed.

Two prediction endpoints, two different states. Message classification
(is this specific message phishing?) is still a placeholder heuristic (see
`app/models/predictor.py`) -- the request → response path works end to end,
but swap the heuristic for a real trained model when there's a dataset to
train one on; nothing above `Predictor` needs to change.

User-awareness prediction (how likely is this person to fall for phishing,
based on their survey/quiz answers?) already runs a real trained model.
Export the fitted Colab preprocessing + estimator pipeline to
`models_store/phishing_awareness_v1.joblib`, set `AWARENESS_MODEL_VERSION`, and
call `POST /predictions/awareness`. The model's native 0-100 result is validated
and normalized to the application's 0-1 `phishingAwarenessScore`. If the model
or service is unavailable, onboarding falls back to diagnostic quiz accuracy.

## Structure (MVC)

```
app/
├── main.py              # FastAPI app: CORS, router mounting
├── core/
│   └── config.py        # Settings (env vars / .env)
├── models/               # M — data schemas + the ML model itself
│   ├── schemas.py        # Pydantic request/response types
│   └── predictor.py       # Predictor interface + HeuristicPredictor placeholder
├── views/                # V — presentation: shapes model output into API responses
│   └── prediction_view.py
├── controllers/           # C — business logic: orchestrates models + views
│   └── prediction_controller.py
└── routes/                # URL wiring: HTTP paths -> controllers
    ├── health.py
    └── predictions.py

tests/                    # pytest, one test file per route group
data/                     # datasets (gitignored, keep out of version control)
models_store/             # trained model artifacts (gitignored)
```

Request flow: `routes` parse the HTTP request → call a `controller` →
which calls the `model` (predictor) for the actual inference → then a
`view` to shape the result into the response schema.

## Local development (without Docker)

The ML runtime is standardized on Python 3.12.13 (see `.python-version`). The
four model libraries are pinned in `requirements.txt` to the exact Colab export
versions so every teammate loads the same joblib pipeline.

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env

# After downloading the two model files into models_store/, verify them:
python scripts/verify_model.py

uvicorn app.main:app --reload --port 8001
```

The service runs at [http://localhost:8001](http://localhost:8001) —
interactive docs at `/docs`.

### Model files for teammates

The trained artifact is about 515 MB and is intentionally gitignored. Store
these two files together in the team's approved shared artifact location:

```text
phishing_awareness_v1.joblib
phishing_awareness_v1.metadata.json
```

Each developer downloads both into `backend/models_store/` and runs
`python scripts/verify_model.py`. The metadata supplies the version and SHA-256
checksum, so nobody has to compare filenames or dependency versions manually.
Do not replace a model under an existing version: publish a new filename,
metadata file, checksum, and `AWARENESS_MODEL_VERSION` instead.

The first prediction can take several seconds because the service streams a
checksum over the roughly 515 MB artifact and then loads it. The Next.js client
therefore defaults `ML_SERVICE_TIMEOUT_MS` to 60000; subsequent predictions use
the cached model instance.

## Local development (with Docker)

```bash
cd backend
docker compose up -d --build
```

## Tests

```bash
cd backend
source .venv/bin/activate   # if not already active
pytest
```

## Adding a real model

1. Drop the trained artifact in `models_store/` (gitignored — don't commit
   model binaries) and raw/processed datasets in `data/` (also gitignored).
2. Replace `HeuristicPredictor` in `app/models/predictor.py` with a real
   implementation (e.g. load a `joblib`/`onnx`/HF model in `__init__`,
   run real inference in `predict()`). Keep the same `Predictor` interface
   so `app/controllers/prediction_controller.py` doesn't need to change.
3. Add whatever training/eval scripts make sense (a `training/` or
   `notebooks/` folder is a reasonable place for those — not part of the
   served app itself).
4. Uncomment the relevant ML libraries (numpy/pandas/scikit-learn/etc.) in
   `requirements.txt`.
