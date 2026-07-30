# PhishAware ML Service (FastAPI)

A separate Python service for model/dataset work — phishing-likelihood
scoring and whatever else comes out of future ML work. This is **not** part
of the Next.js app (`../src/app/api`); it's its own deployable, its own
dependencies, its own lifecycle. The Next.js app is expected to call this
service over HTTP once it exists in production, the same way any external
API would be consumed.

Nothing here trains or ships a real model yet — the classifier is a
placeholder heuristic (see `app/models/predictor.py`) so the whole
request → response path is genuinely working today, not just scaffolding.
Swap the heuristic for a real trained model when there's a dataset to train
one on; nothing above `Predictor` needs to change.

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

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8001
```

The service runs at [http://localhost:8001](http://localhost:8001) —
interactive docs at `/docs`.

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
