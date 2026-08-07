# PhishAware AI/ML backend

This folder contains a small Python service built with FastAPI. It runs
separately from the main Next.js application and exposes HTTP endpoints for
prediction work.

The most important distinction is:

- `POST /predictions/awareness` uses the real trained phishing-awareness model.
- `POST /predictions/classify` uses a temporary keyword heuristic, not a trained
  classifier yet.

The Next.js application calls the awareness endpoint during onboarding. A
browser does not need to call this service directly, and this service does not
connect to MongoDB.

## Quick start

Prerequisites:

- Python 3.12.13 (the version recorded in `.python-version`)
- The model artifact and matching metadata file from the team
- The main application dependencies if you also plan to run Next.js

From the repository root:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
cp .env.example .env
```

On Windows PowerShell, activate the environment with:

```powershell
.venv\Scripts\Activate.ps1
```

Put these files in `backend/models_store/`:

```text
phishing_awareness_v1.joblib
phishing_awareness_v1.metadata.json
```

Verify the download and start the service:

```bash
python scripts/verify_model.py
uvicorn app.main:app --reload --port 8001
```

Run that command from the `backend/` directory. Running it from the repository
root as written will cause `ModuleNotFoundError: No module named 'app'`.

Once started:

- Health check: <http://localhost:8001/healthz>
- Interactive API documentation: <http://localhost:8001/docs>
- OpenAPI JSON: <http://localhost:8001/openapi.json>

The service can start without the model files, but
`POST /predictions/awareness` will return `503` until they are installed and
valid.

## Running the complete application locally

The Next.js application and Python service are separate processes. Use two
terminals.

Terminal 1, from the repository root:

```bash
./dev.sh
```

This prepares MongoDB and starts Next.js on port 3000. It does **not** start the
Python service.

Terminal 2:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

The root `.env` used by Next.js must contain:

```dotenv
ML_SERVICE_URL="http://localhost:8001"
ML_SERVICE_TIMEOUT_MS="60000"
```

`ML_SERVICE_TIMEOUT_MS` is deliberately generous. The first awareness request
checksums and loads a roughly 515 MB artifact; later requests reuse the cached
predictor and should be much faster.

## What happens during onboarding

The end-to-end awareness flow is:

```text
Onboarding survey + diagnostic quiz in the browser
                         |
                         v
POST /api/onboarding/submit in Next.js
  - verifies diagnostic answers with MongoDB scenarios
  - calculates diagnostic accuracy from 0 to 1
                         |
                         v
src/server/mlClient.ts
  - adds diagnostic_accuracy to the survey features
  - calls this service over HTTP
                         |
                         v
POST /predictions/awareness in FastAPI
  - validates the request
  - loads and verifies the model on the first request
  - converts product fields into the Colab model columns
  - calls pipeline.predict(...)
  - validates the model's 0-100 output
  - returns a normalized 0-1 score and model version
                         |
                         v
Next.js
  - chooses the user's starting level and XP
  - stores the result and model provenance in MongoDB
```

FastAPI does not assign the application level. Next.js currently maps the
normalized awareness score as follows:

| Awareness score | Starting level |
| --- | --- |
| Below `0.40` | Beginner |
| `0.40` through below `0.65` | Intermediate |
| `0.65` through `1.00` | Advanced |

If FastAPI is unavailable, times out, rejects the artifact, or fails during
inference, Next.js completes onboarding using diagnostic quiz accuracy. The
stored fallback model version is `diagnostic-accuracy-v0`.

## Architecture

```text
backend/
├── app/
│   ├── main.py                         FastAPI setup, CORS, router mounting
│   ├── core/
│   │   └── config.py                   Environment-backed settings
│   ├── routes/
│   │   ├── health.py                   GET /healthz
│   │   └── predictions.py              Prediction endpoints and HTTP errors
│   ├── controllers/
│   │   ├── awareness_controller.py     Awareness request -> predictor
│   │   └── prediction_controller.py    Classification request -> predictor/view
│   ├── models/
│   │   ├── schemas.py                  Pydantic request/result/response schemas
│   │   ├── awareness_predictor.py      Real joblib awareness adapter
│   │   └── predictor.py                Placeholder message classifier
│   └── views/
│       └── prediction_view.py          Classification threshold/response
├── models_store/                       Local model files; ignored by Git
├── data/                               Local datasets; ignored by Git
├── scripts/
│   └── verify_model.py                 Metadata/checksum verification
├── tests/                              Fast unit and mocked-route tests
├── tests/integration/                  Opt-in real-artifact tests
├── requirements.txt                    Runtime dependencies
├── requirements-dev.txt                Runtime + test dependencies
├── Dockerfile
└── docker-compose.yml
```

The common request flow is:

```text
route -> Pydantic schema -> controller -> predictor -> response schema
```

The classification endpoint additionally uses a small view function to apply
its `0.5` verdict threshold.

## Awareness endpoint

### Request

```http
POST /predictions/awareness
Content-Type: application/json
```

Example:

```json
{
  "emails_per_day": 50,
  "suspicious_emails_per_day": 2,
  "password_length": 16,
  "reuses_passwords": 0,
  "uses_password_manager": 1,
  "mfa_familiar": 1,
  "mfa_enabled": 1,
  "security_training": 1,
  "clicks_links": 30,
  "opens_attachments": 20,
  "verifies_links": 80,
  "reports_suspicious": 70,
  "has_antivirus": 1,
  "uses_vpn": 1,
  "department": "Engineering",
  "work_mode": "Hybrid",
  "diagnostic_accuracy": 0.8
}
```

Try it from another terminal:

```bash
curl -X POST http://localhost:8001/predictions/awareness \
  -H 'Content-Type: application/json' \
  -d '{
    "emails_per_day": 50,
    "suspicious_emails_per_day": 2,
    "password_length": 16,
    "reuses_passwords": 0,
    "uses_password_manager": 1,
    "mfa_familiar": 1,
    "mfa_enabled": 1,
    "security_training": 1,
    "clicks_links": 30,
    "opens_attachments": 20,
    "verifies_links": 80,
    "reports_suspicious": 70,
    "has_antivirus": 1,
    "uses_vpn": 1,
    "department": "Engineering",
    "work_mode": "Hybrid",
    "diagnostic_accuracy": 0.8
  }'
```

### Response

```json
{
  "awareness_score": 0.8159700004281366,
  "model_version": "awareness-v1.0.0"
}
```

The exact score can change when a new model version is installed. The API
contract always requires `awareness_score` to be between 0 and 1.

### Validation rules

- Counts and percentages must be JSON numbers, not numeric strings.
- Yes/no fields must be integer `0` or `1`.
- Habit percentages must be between 0 and 100.
- `diagnostic_accuracy` must be between 0 and 1.
- `mfa_enabled` must be `0` when `mfa_familiar` is `0`.
- Suspicious emails cannot exceed total daily emails.
- Department must be one of the product's ten department values.
- Work mode must be `Remote`, `Hybrid`, or `Office`.
- Unknown request properties are rejected.

Invalid requests return FastAPI's `422 Unprocessable Entity` response and do
not call the model.

## How product fields reach the trained model

The application uses readable API field names. `JoblibAwarenessPredictor`
creates a one-row pandas DataFrame using the exact names and units from Colab:

| API field | Model column | Conversion |
| --- | --- | --- |
| `department` | `department` | None |
| `work_mode` | `work_mode` | None |
| `emails_per_day` | `daily_email_count` | None |
| `suspicious_emails_per_day` | `suspicious_email_frequency` | None |
| `password_length` | `password_length` | None |
| `reuses_passwords` | `password_reuse` | `0/1` to `No/Yes` |
| `uses_password_manager` | `password_manager_usage` | `0/1` to `No/Yes` |
| `mfa_enabled` | `mfa_enabled` | `0/1` to `No/Yes` |
| `security_training` | `cybersecurity_training` | `0/1` to `No/Yes` |
| `diagnostic_accuracy` | `security_quiz_score` | Multiply by 100 |
| `clicks_links` | `link_click_tendency` | None |
| `opens_attachments` | `attachment_open_rate` | None |
| `verifies_links` | `verification_before_click` | None |
| `reports_suspicious` | `reporting_suspicious_email` | None |
| `has_antivirus` | `antivirus_installed` | `0/1` to `No/Yes` |
| `uses_vpn` | `vpn_usage` | `0/1` to `No/Yes` |

`mfa_familiar` is validated and controls whether `mfa_enabled` is logically
allowed, but it is not a separate trained-model column.

The joblib artifact contains both preprocessing and the trained regressor. Do
not manually one-hot encode department or work mode in FastAPI; the fitted
pipeline performs the same preprocessing used during training.

## Model loading and version safety

The first call to `get_awareness_predictor()`:

1. Resolves the artifact and metadata paths from settings.
2. Confirms both files exist.
3. Streams a SHA-256 checksum over the artifact.
4. Compares it with `artifact_sha256` in metadata.
5. Loads the pipeline with `joblib.load()`.
6. Confirms the object exposes `predict()`.
7. Confirms the metadata version matches `AWARENESS_MODEL_VERSION`.

The successful predictor is cached for the life of the Python process. The
model is not reloaded for every request.

The artifact is large and ignored by Git. Share it through the team's approved
file-storage location, not through the repository. Never replace the contents
of an existing published model version. For a new model:

1. Export a new fitted preprocessing + estimator pipeline from Colab.
2. Give the artifact a new versioned filename.
3. Generate matching metadata and SHA-256.
4. Update `AWARENESS_MODEL_FILENAME`, `AWARENESS_METADATA_FILENAME`, and
   `AWARENESS_MODEL_VERSION` together.
5. Run artifact verification and the real-model integration tests.

## Classification endpoint

`POST /predictions/classify` answers a different question: whether one message
looks like phishing. It currently counts suspicious phrases and is only a
working placeholder for the route architecture.

Example:

```bash
curl -X POST http://localhost:8001/predictions/classify \
  -H 'Content-Type: application/json' \
  -d '{
    "subject": "Urgent: verify your account",
    "body": "Click here now or your account will be suspended.",
    "sender": "security@not-a-real-bank.com"
  }'
```

Example response:

```json
{
  "phishing_probability": 1.0,
  "verdict": true,
  "model_version": "heuristic-v0"
}
```

Do not describe this endpoint as a trained classifier in a demo or report.
Replacing `HeuristicPredictor` with a trained implementation should preserve
the existing predictor and response contracts.

## Configuration

`app/core/config.py` reads `backend/.env`. The supported settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_NAME` | `PhishAware ML Service` | Name returned by health/docs |
| `ENVIRONMENT` | `development` | Environment label |
| `MODEL_STORE_DIR` | `backend/models_store` | Artifact directory |
| `AWARENESS_MODEL_FILENAME` | `phishing_awareness_v1.joblib` | Joblib artifact |
| `AWARENESS_METADATA_FILENAME` | `phishing_awareness_v1.metadata.json` | Artifact metadata |
| `AWARENESS_MODEL_VERSION` | `awareness-v1.0.0` | Required deployed version |
| `DATA_DIR` | `backend/data` | Local dataset directory |
| `CORS_ORIGINS` | Localhost ports 3000 | Comma-separated browser origins |

The root `.env` and `backend/.env` serve different programs:

- Root `.env`: Next.js, MongoDB, and `ML_SERVICE_URL`.
- `backend/.env`: Python model filenames, version, paths, and CORS.

Do not put `ML_SERVICE_URL` in `backend/.env` expecting FastAPI to use it;
that variable tells Next.js where FastAPI lives.

## Docker

From `backend/`:

```bash
docker compose up --build
```

The compose file:

- Builds the Python service.
- Publishes port 8001.
- Loads `backend/.env`.
- Mounts `models_store/` and `data/` into the container.

Stop it with:

```bash
docker compose down
```

The model is intentionally not copied into the Docker image. It must exist in
the host's `backend/models_store/` directory so the volume mount can provide it.

## Tests

Install `requirements-dev.txt`, activate the virtual environment, and run:

```bash
cd backend
source .venv/bin/activate
pytest
```

The normal suite uses mock or tiny temporary predictors. It does not load the
large production artifact. It covers:

- Request and response validation
- Mocked FastAPI routes
- Exact API-to-model field mapping
- Score normalization
- Missing, corrupt, wrong-version, and wrong-checksum artifacts
- Invalid model output and controlled `503` errors
- Placeholder classification behavior

Run only the awareness tests with:

```bash
pytest tests/test_awareness.py -q
```

Run the opt-in real-artifact integration tests with:

```bash
RUN_MODEL_INTEGRATION=1 pytest -m model_integration
```

Those integration tests load the real artifact once and verify metadata,
checksum, inference, normalization, caching, representative low/medium/high
personas, and every supported department/work-mode combination.

From the repository root, the TypeScript client has a real-HTTP integration
test that starts a temporary local server:

```bash
bun test src/server/mlClient.integration.test.ts
```

The Next.js onboarding route tests are:

```bash
bun test src/app/api/onboarding/submit/route.test.ts
```

## Common problems

### `ModuleNotFoundError: No module named 'app'`

Start Uvicorn while your working directory is `backend/`:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

### Awareness endpoint returns `503`

Check the response detail and the server terminal. Common causes are:

- Missing artifact or metadata.
- Checksum mismatch.
- Invalid metadata JSON.
- `AWARENESS_MODEL_VERSION` does not match metadata.
- The joblib artifact cannot load with the installed dependencies.
- The model returned an invalid value or raised during inference.

Run:

```bash
python scripts/verify_model.py
```

### Next.js logs “Awareness model service could not be reached”

Confirm:

1. FastAPI is running on port 8001.
2. Root `.env` contains `ML_SERVICE_URL="http://localhost:8001"`.
3. You restarted Next.js after changing `.env`.
4. `curl http://localhost:8001/healthz` succeeds.
5. The configured timeout is long enough for the first model load.

### Request returns `422`

Open `/docs` to inspect the accepted request. Ensure numeric fields are JSON
numbers, all required fields are present, binary values are `0` or `1`, and no
unknown fields are included.

### Checksum verification is slow

That is expected for the roughly 515 MB model. Verification streams the file
instead of loading a second copy into memory. It happens once per service
process before the predictor is cached.

## Responsibilities at a glance

| Concern | Owner |
| --- | --- |
| Survey UI and diagnostic questions | Next.js frontend |
| Diagnostic-answer scoring | Next.js onboarding route |
| HTTP call to Python | `src/server/mlClient.ts` |
| Request validation | FastAPI/Pydantic |
| Product-to-model field mapping | `app/models/awareness_predictor.py` |
| Preprocessing and regression | Exported joblib pipeline |
| 0-100 to 0-1 normalization | Awareness predictor |
| Starting level and XP | Next.js leveling logic |
| User persistence | Next.js/MongoDB |
| ML outage fallback | Next.js onboarding route |
| Model checksum/version enforcement | Awareness predictor + metadata |
