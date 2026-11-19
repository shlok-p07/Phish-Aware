FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Model binaries stay outside the image by default. Mount models_store at
# /app/models_store (as docker-compose.yml does) or deliberately add a
# versioned artifact in the production image pipeline.

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
